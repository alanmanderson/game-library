"""Pure action reducers. One module per WebSocket action.

Every reducer follows the same signature:

    reduce(state: dict, payload: dict, actor_seat: str | None, metadata: dict)
        -> (new_state: dict, events: list[dict], side_effects: list[dict])

Rules:
  - Reducers MUST NOT import from `app.websocket.*`, `app.api.*`, or sqlalchemy.
  - Reducers mutate a defensive copy and return it; callers pass in a
    deep-copied dict so reducers can treat it as owned.
  - On rule violations, raise `GameRuleError(code, message)`.
  - `metadata` carries adapter-provided non-determinism and auth context:
      - seat_to_user_id: dict[seat -> uuid|None]  (for event payload shaping)
      - new_deal: dict[seat -> list[str]]         (shuffled hands for START_GAME / next hand / rematch)
      - new_dealer, first_bidder                  (seat assignments for rematch / next hand)
  - Events are dispatch specs the adapter translates to WS frames. Scopes:
      - "broadcast"          -> send to whole room
      - "seat"               -> send to one seat's connection(s)
      - "per_seat"           -> send a distinct payload to each seat
  - Side-effect descriptors (analytics writes) are returned so the adapter
    can persist them outside the reducer.
"""
