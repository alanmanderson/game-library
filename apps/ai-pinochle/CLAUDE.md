# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An AI-powered Pinochle card game. Tech stack: **React Native** (mobile, iOS + Android), **React** (web), **Python/FastAPI** (server).

## Repository Structure

```
ai-pinochle/
├── server/          # Python/FastAPI backend
│   └── app/
│       ├── api/         # REST routes (/auth, /games)
│       ├── websocket/   # WebSocket handlers + connection manager
│       ├── engine/      # Game engine (deck, meld, tricks, scoring)
│       ├── models/      # SQLAlchemy ORM models (users, games)
│       ├── config.py    # App settings (secrets, DB URL, Google client ID)
│       ├── database.py  # Async SQLAlchemy session setup
│       └── main.py      # FastAPI app entrypoint
├── mobile/          # React Native app (iOS + Android)
│   └── src/
├── web/             # React web client
│   └── src/
├── shared/          # @pinochle/shared — TypeScript types for mobile + web
│   └── src/
│       ├── types/       # WebSocket event/payload types, card types
│       └── constants/   # Card ranks/suits, game phase names, meld values
├── docs/            # Project documentation (design.md, RULES.md)
├── public/          # Card image assets (web-served; mobile loads via URL)
└── package.json     # npm workspaces root (mobile, web, shared)
```

The `shared/` package is TypeScript-only. The Python server and JS clients share no runtime code.

## Card Assets

Card images live in `public/img/` with the naming convention `{Rank}{Suit}.png`, matching the server's card codes:
- Ranks: `9`, `10`, `J`, `K`, `Q`, `A`
- Suits: `C` (clubs), `D` (diamonds), `H` (hearts), `S` (spades)

Example: `public/img/AC.png` = Ace of Clubs, `public/img/10S.png` = Ten of Spades. A `back.svg` is also available for face-down cards. All 24 unique Pinochle cards are present.

## Design Decisions

Refer to `docs/design.md` for all architectural and design decisions. It is the source of truth for:
- System architecture (thin client / authoritative server model)
- Database schema (PostgreSQL tables: `users`, `games`; all game state in `current_state_json`)
- Game engine state machine phases: `LOBBY_WAITING` → `BIDDING` → `NAMING_TRUMP` → `PASSING_CARDS` → `SHOWING_MELD` → `TRICK_PLAYING` → `HAND_COMPLETE` → loops
- REST API endpoints and WebSocket message contracts (8 actions, 19 events)
- State persistence (PostgreSQL JSON, no Redis) and reconnect behavior

When making implementation choices (data modeling, API shape, WebSocket events, state transitions), consult `docs/design.md` first and stay consistent with the contracts defined there.

## Code Style

- Keep files short and focused. Split into more files rather than letting any single file grow large.
- Keep functions simple and easy to follow.
- Avoid unnecessary abstractions — prefer straightforward, direct code over layers of indirection. The overall design should stay simple.

## Pinochle Rules Reference

This game implements **4-player partnership Pinochle** (North/South vs East/West). Standard double-deck: 48 cards (two copies each of 9, 10, J, Q, K, A in all four suits). See `docs/RULES.md` for full rules and `docs/design.md` Section 3 for meld values, scoring, and legal card rules as implemented.
