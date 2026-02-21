# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An AI-powered Pinochle card game. Tech stack: **React Native** (mobile, iOS + Android), **React** (web), **Python/FastAPI** (server).

## Repository Structure

```
ai-pinochle/
├── server/          # Python/FastAPI backend
│   └── app/
│       ├── api/         # REST routes (/auth, /games, /users)
│       ├── websocket/   # WebSocket handlers + pub/sub
│       ├── engine/      # Game engine & state machine
│       ├── models/      # SQLAlchemy ORM models
│       └── services/    # Redis client, auth helpers
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

Card images live in `public/img/` with the naming convention `{rank}{suit}.png`:
- Ranks: `9`, `10`, `j`, `k`, `q`, `a`
- Suits: `c` (clubs), `d` (diamonds), `h` (hearts), `s` (spades)

Example: `public/img/ac.png` = Ace of Clubs, `public/img/10s.png` = Ten of Spades.

Note: As of project initialization, only 9s, 10s, and Aces are present (and only Ace of Clubs and Ace of Hearts). The full Pinochle deck needs cards for Jacks, Queens, Kings, and the remaining Aces.

## Design Decisions

Refer to `docs/design.md` for all architectural and design decisions. It is the source of truth for:
- System architecture (thin client / authoritative server model)
- Database schema (PostgreSQL tables: `users`, `games`, `hands`, `bids`, `tricks`)
- Game engine state machine and its phases
- REST API endpoints and WebSocket message contracts
- Redis state hydration and game resume flow
- Lobby concurrency handling via `HSETNX`

When making implementation choices (data modeling, API shape, WebSocket events, state transitions), consult `docs/design.md` first and stay consistent with the contracts defined there.

## Code Style

- Keep files short and focused. Split into more files rather than letting any single file grow large.
- Keep functions simple and easy to follow.
- Avoid unnecessary abstractions — prefer straightforward, direct code over layers of indirection. The overall design should stay simple.

## Pinochle Rules Reference

Standard double-deck Pinochle uses 48 cards (two copies each of 9, 10, J, Q, K, A in all four suits). Typical variants are 4-player partnership or 3-player cutthroat.
