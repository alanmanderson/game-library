# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An AI-powered Pinochle card game (web-based, given the `/public` directory structure). No tech stack has been chosen yet.

## Card Assets

Card images live in `public/img/` with the naming convention `{rank}{suit}.png`:
- Ranks: `9`, `10`, `j`, `k`, `q`, `a`
- Suits: `c` (clubs), `d` (diamonds), `h` (hearts), `s` (spades)

Example: `public/img/ac.png` = Ace of Clubs, `public/img/10s.png` = Ten of Spades.

Note: As of project initialization, only 9s, 10s, and Aces are present (and only Ace of Clubs and Ace of Hearts). The full Pinochle deck needs cards for Jacks, Queens, Kings, and the remaining Aces.

## Design Decisions

Refer to `design.md` for all architectural and design decisions. It is the source of truth for:
- System architecture (thin client / authoritative server model)
- Database schema (PostgreSQL tables: `users`, `games`, `hands`, `bids`, `tricks`)
- Game engine state machine and its phases
- REST API endpoints and WebSocket message contracts
- Redis state hydration and game resume flow
- Lobby concurrency handling via `HSETNX`

When making implementation choices (data modeling, API shape, WebSocket events, state transitions), consult `design.md` first and stay consistent with the contracts defined there.

## Pinochle Rules Reference

Standard double-deck Pinochle uses 48 cards (two copies each of 9, 10, J, Q, K, A in all four suits). Typical variants are 4-player partnership or 3-player cutthroat.
