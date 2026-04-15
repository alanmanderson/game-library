"""Tests for the Redis pub/sub broker and its integration with
ConnectionManager for multi-instance WebSocket fan-out.

All tests use ``fakeredis.aioredis`` — no real Redis required.
"""
import asyncio

import fakeredis.aioredis
import pytest

from app.websocket.broker import RedisBroker
from app.websocket.connection_manager import ConnectionManager


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _wait_until(pred, timeout: float = 2.0, interval: float = 0.02):
    """Poll ``pred`` until it returns truthy or the timeout elapses."""
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        if pred():
            return True
        await asyncio.sleep(interval)
    return False


def _make_broker(on_message, server=None) -> RedisBroker:
    """Build a broker backed by a shared fakeredis server.

    ``server`` lets multiple brokers share the same fakeredis, simulating
    two app instances on one Redis.
    """
    if server is None:
        server = fakeredis.FakeServer()
    client = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)
    # url is set so ``enabled`` is True, but _ensure_client returns our
    # injected client and never touches the url.
    broker = RedisBroker(
        url="redis://test/0", on_message=on_message, redis_client=client
    )
    return broker


# ---------------------------------------------------------------------------
# Core publish / subscribe
# ---------------------------------------------------------------------------


async def test_publish_without_subscribers_is_noop():
    """Publishing to a channel no one listens to must not error."""
    broker = _make_broker(on_message=lambda room, event: _noop())
    try:
        await broker.publish("ROOM", {"event": "HELLO"})
    finally:
        await broker.close()


async def _noop(*args, **kwargs):
    return None


async def test_subscribe_receives_message_from_another_publisher():
    """A subscriber on process B must receive what process A publishes."""
    received: list[tuple[str, dict]] = []

    async def on_msg(room, event):
        received.append((room, event))

    server = fakeredis.FakeServer()
    consumer = _make_broker(on_message=on_msg, server=server)
    producer = _make_broker(on_message=_noop, server=server)

    try:
        await consumer.subscribe("ABCD")
        # Give the listener a tick to register the subscription.
        await asyncio.sleep(0.05)

        await producer.publish("ABCD", {"event": "PING", "payload": {"n": 1}})

        assert await _wait_until(lambda: len(received) == 1), (
            f"expected 1 delivery, got {received}"
        )
        room, event = received[0]
        assert room == "ABCD"
        assert event == {"event": "PING", "payload": {"n": 1}}
    finally:
        await consumer.close()
        await producer.close()


async def test_publisher_does_not_receive_own_echo():
    """A process publishing to a room it's subscribed to must not re-deliver."""
    received: list[tuple[str, dict]] = []

    async def on_msg(room, event):
        received.append((room, event))

    broker = _make_broker(on_message=on_msg)
    try:
        await broker.subscribe("ROOM")
        await asyncio.sleep(0.05)
        await broker.publish("ROOM", {"event": "SELF"})
        # Give any (incorrect) echo time to arrive.
        await asyncio.sleep(0.15)
        assert received == [], f"origin dedup failed: {received}"
    finally:
        await broker.close()


async def test_refcount_unsubscribe_stops_delivery():
    """After unsubscribe drops the refcount to zero, new events must not arrive."""
    received: list[tuple[str, dict]] = []

    async def on_msg(room, event):
        received.append((room, event))

    server = fakeredis.FakeServer()
    consumer = _make_broker(on_message=on_msg, server=server)
    producer = _make_broker(on_message=_noop, server=server)
    try:
        await consumer.subscribe("R1")
        await consumer.subscribe("R1")  # refcount = 2
        await asyncio.sleep(0.05)

        await consumer.unsubscribe("R1")  # refcount = 1, still subscribed
        await asyncio.sleep(0.05)

        await producer.publish("R1", {"event": "STILL_HERE"})
        assert await _wait_until(lambda: len(received) == 1)

        await consumer.unsubscribe("R1")  # refcount = 0 → actually unsubscribe
        await asyncio.sleep(0.1)
        received.clear()

        await producer.publish("R1", {"event": "SHOULD_NOT_ARRIVE"})
        await asyncio.sleep(0.2)
        assert received == []
    finally:
        await consumer.close()
        await producer.close()


# ---------------------------------------------------------------------------
# Reconnect behavior
# ---------------------------------------------------------------------------


async def test_reconnect_after_transport_error(monkeypatch):
    """Simulate a transport failure; the listener must reconnect and keep
    delivering messages. We force the first ``get_message`` call to raise
    a RuntimeError, then let subsequent calls return real messages."""
    received: list[tuple[str, dict]] = []

    async def on_msg(room, event):
        received.append((room, event))

    server = fakeredis.FakeServer()
    consumer = _make_broker(on_message=on_msg, server=server)
    producer = _make_broker(on_message=_noop, server=server)

    try:
        await consumer.subscribe("RECON")
        await asyncio.sleep(0.05)

        # Patch the listener's pubsub.get_message to raise once, forcing
        # the reconnect path to execute. After one raise we return control.
        original = consumer._pubsub.get_message
        calls = {"n": 0}

        async def flaky(*args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("simulated transport error")
            return await original(*args, **kwargs)

        consumer._pubsub.get_message = flaky  # type: ignore[assignment]
        # Shrink backoff so the test runs fast.
        import app.websocket.broker as broker_module

        monkeypatch.setattr(broker_module, "_BACKOFF_START", 0.01)
        monkeypatch.setattr(broker_module, "_BACKOFF_CAP", 0.05)

        # Give the listener time to hit the raise + reconnect.
        await asyncio.sleep(0.3)

        await producer.publish("RECON", {"event": "AFTER_RECONNECT"})
        assert await _wait_until(lambda: len(received) >= 1, timeout=3.0), (
            f"no delivery after reconnect; received={received}"
        )
        assert any(ev.get("event") == "AFTER_RECONNECT" for _, ev in received)
    finally:
        await consumer.close()
        await producer.close()


# ---------------------------------------------------------------------------
# ConnectionManager integration — two-process fan-out
# ---------------------------------------------------------------------------


class _FakeWebSocket:
    """Minimal stand-in for Starlette's WebSocket for broadcast tests."""

    def __init__(self) -> None:
        self.sent: list[dict] = []
        self.accepted = False
        self.closed = False

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, message: dict) -> None:
        self.sent.append(message)

    async def close(self, code: int = 1000, reason: str = "") -> None:
        self.closed = True


async def test_two_managers_share_one_fakeredis():
    """End-to-end: two ConnectionManager instances (simulating two app
    processes) on one fakeredis. A broadcast on A reaches B's local socket."""
    import uuid

    server = fakeredis.FakeServer()
    mgr_a = ConnectionManager()
    mgr_b = ConnectionManager()

    broker_a = _make_broker(on_message=mgr_a.deliver_remote, server=server)
    broker_b = _make_broker(on_message=mgr_b.deliver_remote, server=server)
    mgr_a.set_broker(broker_a)
    mgr_b.set_broker(broker_b)

    ws_a = _FakeWebSocket()
    ws_b = _FakeWebSocket()

    try:
        from app.websocket.connection_manager import Connection

        await mgr_a.connect("GAME42", Connection(ws_a, uuid.uuid4(), "alice"))
        await mgr_b.connect("GAME42", Connection(ws_b, uuid.uuid4(), "bob"))
        # Wait for both processes' subscriptions to register.
        await asyncio.sleep(0.1)

        await mgr_a.broadcast("GAME42", {"event": "CARD_PLAYED", "payload": {"seat": "NORTH"}})

        # Alice sees it immediately via local delivery.
        assert ws_a.sent == [
            {"event": "CARD_PLAYED", "payload": {"seat": "NORTH"}}
        ]
        # Bob sees it via the broker.
        assert await _wait_until(lambda: len(ws_b.sent) == 1)
        assert ws_b.sent[0] == {"event": "CARD_PLAYED", "payload": {"seat": "NORTH"}}

        # And critically, Alice did NOT get a duplicate from the Redis echo.
        await asyncio.sleep(0.15)
        assert len(ws_a.sent) == 1, f"origin got duplicate: {ws_a.sent}"
    finally:
        await broker_a.close()
        await broker_b.close()


async def test_unset_redis_url_falls_back_to_in_process_broadcast():
    """When the broker isn't attached, broadcast still works for local sockets."""
    import uuid

    from app.websocket.connection_manager import Connection

    mgr = ConnectionManager()  # no broker
    ws1 = _FakeWebSocket()
    ws2 = _FakeWebSocket()
    await mgr.connect("SOLO", Connection(ws1, uuid.uuid4(), "alice"))
    await mgr.connect("SOLO", Connection(ws2, uuid.uuid4(), "bob"))

    await mgr.broadcast("SOLO", {"event": "HELLO"})

    assert ws1.sent == [{"event": "HELLO"}]
    assert ws2.sent == [{"event": "HELLO"}]


async def test_broker_disabled_without_url():
    """A broker with empty url + no injected client is a pure no-op."""

    async def on_msg(room, event):
        raise AssertionError("should not be called")

    broker = RedisBroker(url="", on_message=on_msg)
    assert broker.enabled is False
    # All entry points must be safe to call.
    await broker.publish("ANY", {"event": "NOPE"})
    await broker.subscribe("ANY")
    await broker.unsubscribe("ANY")
    await broker.close()
