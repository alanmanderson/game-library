"""Redis pub/sub broker for multi-instance WebSocket fan-out.

One ``RedisBroker`` instance per process. It holds a single Redis connection
and a single ``PubSub`` subscription whose channel set is managed by
ref-counted ``subscribe``/``unsubscribe`` calls from the connection manager.

When ``redis_url`` is empty, the broker is a no-op: ``publish`` and
``subscribe`` return immediately, and in-process broadcast keeps working
unchanged. This keeps local dev and the existing test suite Redis-free.

Message envelope on the wire::

    {"publisher_id": "<uuid>", "event": {<original WS frame>}}

The ``publisher_id`` lets the originating process drop its own echoes so
local subscribers aren't re-dispatched via Redis (see the listener loop).
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Awaitable, Callable

logger = logging.getLogger(__name__)

# Channel namespace so room codes can't collide with other pub/sub traffic
# that may coexist on a shared Redis (analytics, cache invalidations, etc).
_CHANNEL_PREFIX = "pinochle:ws:"

# Reconnect backoff: start at 1s, double to a 30s cap.
_BACKOFF_START = 1.0
_BACKOFF_CAP = 30.0

DeliverCallback = Callable[[str, dict], Awaitable[None]]


def _channel(room_code: str) -> str:
    return f"{_CHANNEL_PREFIX}{room_code}"


class RedisBroker:
    """Thin async pub/sub wrapper.

    Responsibilities:
      * one Redis connection per process
      * one PubSub subscription, ref-counted per room
      * deliver remote events to the connection manager via ``on_message``
      * reconnect with capped exponential backoff
    """

    def __init__(
        self,
        url: str,
        on_message: DeliverCallback,
        *,
        redis_client=None,
    ) -> None:
        self._url = url
        self._on_message = on_message
        # Stable per-process ID so we can drop our own echoes from Redis.
        self.publisher_id = str(uuid.uuid4())
        self._redis = redis_client  # tests may inject a fakeredis client
        self._pubsub = None
        self._listener_task: asyncio.Task | None = None
        self._refcounts: dict[str, int] = {}
        self._lock = asyncio.Lock()
        self._closed = False

    @property
    def enabled(self) -> bool:
        return bool(self._url) or self._redis is not None

    async def _ensure_client(self):
        if self._redis is not None:
            return self._redis
        # Import here so the server boots without redis installed when
        # ``redis_url`` is unset.
        from redis import asyncio as redis_asyncio  # type: ignore

        self._redis = redis_asyncio.from_url(self._url, decode_responses=True)
        return self._redis

    async def publish(self, room_code: str, event: dict) -> None:
        """Publish a room event to all subscribers in the cluster.

        No-op when the broker is disabled. Never raises — a flaky Redis
        must not break local WebSocket delivery.
        """
        if not self.enabled or self._closed:
            return
        try:
            client = await self._ensure_client()
            envelope = json.dumps({
                "publisher_id": self.publisher_id,
                "event": event,
            })
            await client.publish(_channel(room_code), envelope)
        except Exception:
            logger.exception("RedisBroker.publish failed for room %s", room_code)

    async def subscribe(self, room_code: str) -> None:
        """Record a local subscriber in ``room_code``.

        First subscriber in a process starts the listener task (lazily) and
        issues a ``SUBSCRIBE`` to the channel. Subsequent calls just bump
        the refcount.
        """
        if not self.enabled or self._closed:
            return
        async with self._lock:
            self._refcounts[room_code] = self._refcounts.get(room_code, 0) + 1
            if self._refcounts[room_code] == 1:
                await self._add_channel(room_code)

    async def unsubscribe(self, room_code: str) -> None:
        """Release one local subscriber's interest in ``room_code``.

        Last unsubscribe issues ``UNSUBSCRIBE`` so we stop receiving those
        events. The listener task keeps running — it's cheap, and a new
        subscribe may arrive at any moment.
        """
        if not self.enabled or self._closed:
            return
        async with self._lock:
            count = self._refcounts.get(room_code, 0)
            if count <= 1:
                self._refcounts.pop(room_code, None)
                await self._remove_channel(room_code)
            else:
                self._refcounts[room_code] = count - 1

    async def _add_channel(self, room_code: str) -> None:
        try:
            client = await self._ensure_client()
            if self._pubsub is None:
                self._pubsub = client.pubsub()
            await self._pubsub.subscribe(_channel(room_code))
            if self._listener_task is None or self._listener_task.done():
                self._listener_task = asyncio.create_task(
                    self._listen(), name="redis_broker_listener"
                )
        except Exception:
            logger.exception("RedisBroker subscribe failed for %s", room_code)

    async def _remove_channel(self, room_code: str) -> None:
        if self._pubsub is None:
            return
        try:
            await self._pubsub.unsubscribe(_channel(room_code))
        except Exception:
            logger.exception("RedisBroker unsubscribe failed for %s", room_code)

    @staticmethod
    async def _aclose(obj) -> None:
        """Close ``obj`` using whichever close method it exposes.

        redis-py 5.0.1 deprecated ``close()`` in favour of ``aclose()``.
        Swallow errors — callers only close on shutdown/reconnect.
        """
        if obj is None:
            return
        closer = getattr(obj, "aclose", None) or getattr(obj, "close", None)
        if closer is None:
            return
        try:
            await closer()
        except Exception:
            pass

    async def _listen(self) -> None:
        """Consume messages, dispatch to on_message, reconnect on failure."""
        backoff = _BACKOFF_START
        while not self._closed:
            try:
                assert self._pubsub is not None
                # ``get_message`` with ``ignore_subscribe_messages=True`` and a
                # short timeout gives us a simple cancellation-friendly loop.
                msg = await self._pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
                if msg is None:
                    continue
                backoff = _BACKOFF_START  # any successful read resets backoff
                await self._handle_message(msg)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "RedisBroker listener error; reconnecting in %.1fs", backoff
                )
                await self._reconnect(backoff)
                backoff = min(backoff * 2, _BACKOFF_CAP)

    async def _handle_message(self, msg: dict) -> None:
        channel = msg.get("channel")
        data = msg.get("data")
        if not channel or not data:
            return
        if isinstance(channel, bytes):
            channel = channel.decode()
        if not channel.startswith(_CHANNEL_PREFIX):
            return
        room_code = channel[len(_CHANNEL_PREFIX):]
        try:
            envelope = json.loads(data)
        except (TypeError, ValueError):
            logger.warning("dropped malformed broker message on %s", channel)
            return
        if envelope.get("publisher_id") == self.publisher_id:
            # Our own echo — already delivered locally by the manager.
            return
        event = envelope.get("event")
        if not isinstance(event, dict):
            return
        try:
            await self._on_message(room_code, event)
        except Exception:
            logger.exception("on_message callback failed for room %s", room_code)

    async def _reconnect(self, delay: float) -> None:
        """Tear down and rebuild the pubsub after a transport error."""
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            raise
        try:
            await self._aclose(self._pubsub)
            self._pubsub = None
            await self._aclose(self._redis)
            self._redis = None
            # Rebuild client + pubsub, re-subscribe to every active channel.
            client = await self._ensure_client()
            self._pubsub = client.pubsub()
            async with self._lock:
                channels = [_channel(r) for r in self._refcounts]
            if channels:
                await self._pubsub.subscribe(*channels)
        except Exception:
            logger.exception("RedisBroker reconnect failed; will retry")

    async def close(self) -> None:
        """Shut down cleanly (tests + app lifespan)."""
        self._closed = True
        if self._listener_task is not None:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except (asyncio.CancelledError, Exception):
                pass
            self._listener_task = None
        await self._aclose(self._pubsub)
        self._pubsub = None
        await self._aclose(self._redis)
        self._redis = None
