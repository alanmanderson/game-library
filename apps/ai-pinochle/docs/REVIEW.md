# AI Pinochle — Application Review

_A consolidated review spanning user experience, front-end code, back-end code, and cloud cost. Prepared 2026-04-14._

Four specialists reviewed the repository independently (front-end engineer, back-end engineer, UX designer, cost/infra reviewer). This document synthesizes their findings into a prioritized plan.

---

## Executive Summary

The game has **a solid engine, clean REST/WS scaffolding, and a working MVP loop**, but three structural weaknesses hold it back:

1. **It doesn't feel like a game.** No sound, no animation, no celebration, no game-over screen. Delight moments that are cheap to add are entirely absent.
2. **"AI-powered" is aspirational.** There is no AI opponent in the codebase. The README claim is unbacked and it blocks solo play — the single largest engagement gap.
3. **The server's state machine is a 1,153-line handler file.** Phase logic, WS I/O, DB persistence, and broadcast plumbing are interleaved. This is the main brake on future development (AI, replays, tests, analytics).

Cloud spend is **~$70–85/month** on Azure and roughly 2× oversized for current load, but only ~$60/mo is recoverable and only if you're not on VS Enterprise credits. **If credits are active, infra cost is effectively $0 and there's no financial reason to migrate.**

### Top 10 recommendations, ranked by ROI

| # | Change | Effort | Impact |
|---|---|---|---|
| 1 | Add a game-over screen with rematch / return-to-lobby | S | High |
| 2 | Implement a random-legal-move AI opponent (~80 LOC) | M | High |
| 3 | Extract the state machine out of `websocket/handlers.py` into pure action reducers | L | High |
| 4 | Persistent trump indicator + cumulative score on the play surface | S | High |
| 5 | In-app rules / tutorial / hand-hint tooltips | M | High |
| 6 | Optimize card images (AVIF or sprite) — cuts LCP ~5×; add sound & card-deal animation | S/M | High |
| 7 | Add a `version` column and optimistic locking on `games` | S | High (latent bug) |
| 8 | Persist `hands`/`bids`/`tricks` rows so replays, stats, leaderboards become possible | M | High |
| 9 | Disconnect-forfeit background task (already TODO'd in code) | S | Medium (user trust) |
| 10 | Replace `lastEvent` prop + `flushSync` with pub/sub callback; extract `useGameState` reducer into `shared/` | M | Medium (kills 400 lines of web/mobile duplication) |

Legend: S ≤ 1 day, M ≤ 1 week, L > 1 week

---

## 1. User Experience

### What works and should be preserved
- **Reconnect overlay** (`GamePage.tsx:366-372`) + backoff in `useWebSocket.ts` is a real strength.
- **Optimistic card-play with rollback** on server `ERROR` (`GamePage.tsx:73, 126-131, 261-269`) — players never get stuck on a desynced card.
- **Pass-cards interaction** (`PassCardsPhase.tsx:78-109`) is the single most accessible component: keyboard support, `aria-checked`, 3-card enforcement, disabled submit. This is the style bar for the rest of the app.
- **2-second trick pause** (`GamePage.tsx:300-308`) is a small but important piece of pacing.
- **Browser-back restores room state** via URL + sessionStorage.

### High-priority UX problems

1. **No game-over screen.** `phaseLabel` handles `GAME_OVER` (`GamePage.tsx:492-493`) but nothing renders for it. After 150 points, players see the last `HandResult` and… nothing. This is the *primary* delight moment of the game and it is missing.
2. **No rules, tutorial, or practice mode.** Grep for `rules|help|tutorial|how to play` in `web/src` returns zero matches. `docs/RULES.md` exists but is never surfaced. Pinochle has unusual mechanics (double deck, meld categories, "must-beat", shoot-the-moon) that are not self-evident.
3. **Bidding is opaque.** `BiddingPhase.tsx` shows "Your turn to bid" + a number input defaulting to 25. A first-time player has no idea what 25 means, what increments are legal, what happens on all-pass, or that the winner picks trump and receives passed cards. The Pass button has no confirmation — a dealer misclick ends bidding.
4. **"Why can't I play this card?" has no answer.** `HandDisplay.tsx:27-32` greys illegal cards with no tooltip or hint. When a player clicks a legal-looking card and gets an `ERROR`, the auto-dismissed toast is the only feedback.
5. **Trump indicator missing during trick play.** `TrickPhase.tsx:55-99` shows trick number and hand scores but **not the trump suit**. The only cue is a class on trump cards in your own hand — which disappears when you run out of trump.
6. **Cumulative game score hidden during play.** `game_scores` only appears on `HandResult`. Players can't answer "are we ahead overall?" without leaving the table.
7. **Shoot-the-moon UX is dangerous.** `TrumpPhase.tsx:55-62` is a bare checkbox with no explanation. Selecting trump submits immediately — a casual tap bets the game on taking every trick.

### Medium-priority

- "Acknowledged / 1 of 4" screens don't say *who* you're waiting on.
- Melds are displayed as numbers only — no drill-down to see which cards make a Pinochle or Marriage (teaching moment lost).
- Room code has **no copy/share button** (`RoomPage.tsx:96-98`) — the single biggest friction point in the invite flow.
- No seat swap, no kick.
- Bid input is a raw number field — steppers (+1 / +5) would be faster and less error-prone.
- `MyGamesPage` 5-column table won't fit on mobile web.
- No spectator / observer mode.

### Accessibility (code + design combined)
- Status changes (turn, disconnect) are not in `aria-live` regions — screen-readers don't announce whose turn it is.
- `OtherPlayerHand.tsx:11` uses `alt="card back"` twelve times — screen-reader spam. Should be decorative + one "East has 9 cards" label on the wrapper.
- Card click handlers on `<img role="button">` — use real `<button>` elements.
- Focus is lost on phase transitions (bidding → trump → meld) — no focus management.
- Legal-vs-illegal cards differ by color + opacity only — add a non-color cue (checkmark, badge).
- Contrast issues: `#aaa` on `#1a3a1a` fails WCAG AA; `#888` on dark hand-result panel is worse.
- Colorblind risk: red/black suit color (`constants.ts:26-31`) is the only cue on the trump-selection buttons.

### Microcopy tightening
- "OK" on hand result → "Continue" or "Next hand".
- "Acknowledged" → "Waiting for others".
- "Meld Phase" → "Showing Melds".
- Empty seat: "Sit" → "Sit here".

### Known interaction bugs
- `sessionStorage` room code may survive logout, bouncing a new user into the previous user's room (403).
- `CARD_PLAYED` arriving before the 2s trick-result timer clears the winner banner before the loser can read it (`GamePage.tsx:272-277`).
- Bid input resets on `minimum_valid_bid` updates — slow connections can erase a player's typed value.
- Phase-label / content mismatch on `LOBBY_WAITING` and `GAME_OVER` — status bar says "Game Over" while body still shows the last `HandResult`.

---

## 2. Front-End (Code & Performance)

### High-impact

**God components duplicated across web and mobile.** `/app/web/src/game/GamePage.tsx` (495 lines) and `/app/mobile/src/game/GameScreen.tsx` (583 lines) contain near-identical 200-line WS event switches. Every new event is added twice. Extract a `useGameState(lastEvent, mySeat)` reducer into `shared/` — it's platform-agnostic — and eliminate ~400 lines of duplication.

**`lastEvent` single-slot state with `flushSync` is an architectural workaround, not a design.** `web/src/hooks/useWebSocket.ts:45-54` uses `flushSync` per message; the mobile version uses a timeout queue. Both patch the same root issue: `useEffect([lastEvent])` misses same-shaped repeats. Replace with a pub/sub (`onEvent` callback dispatched imperatively from `ws.onmessage`). Removes the `react-hooks/exhaustive-deps` disable at `GamePage.tsx:335` and kills a class of "missed event" bugs.

**Type erosion at the WS boundary.** `WsEvent.payload` is `Record<string, unknown>` (`shared/src/types.ts:29`). Casts like `as unknown as BiddingState` appear at `GamePage.tsx:156,161` — a red flag that payload shape and type shape disagree. Make `WsEvent` a discriminated union keyed on `event`, validate with Zod at the boundary (~40 LOC).

**Card images are the LCP liability.** 24 PNGs totalling ~1.2 MB, averaged ~47 KB each, for ~80×112 px display = 10–20× oversized. A 12-card hand downloads ~560 KB on first paint.
- Ship AVIF at 2× display size → expected total <150 KB.
- Or sprite into one image + CSS `background-position` (one request).
- Preload `back.png`.
- Set explicit `width`/`height` on `<img>` — prevents CLS.

**No code splitting.** The login bundle drags in the full game + `@react-oauth/google`. Split at auth and at `RoomPage → GamePage`.

### Medium

- `React.memo` `PlayerAvatar` and `OtherPlayerHand`; memoize `sortHand` in `HandDisplay.tsx:17`.
- `RECONNECT_DELAYS` has **no jitter** — four clients stampede on server restart.
- Web `useWebSocket` has no `ws.onerror` handler (mobile does).
- `beforeunload` handler at `GamePage.tsx:109-115` calls `preventDefault()` without setting `returnValue` — modern browsers ignore it.
- No error boundary around `<GamePage>` — one payload shape mismatch white-screens the game.

### Graphics / branding

The game currently **looks like a prototype**:
- No logo, no wordmark, default-ish favicon, `<title>` just "Pinochle", no loading screen.
- Palette is two greens and a red, inconsistent between meld and hand-result panels.
- Typography is `system-ui` with no weight hierarchy — reads like an admin panel.
- 2px `#ccc` card border fights the card art. Drop to 1 px or switch to a soft shadow.
- **Zero animations.** No deal, no card-flight on play, no trick-collection sweep, no celebration, no score counter. This is the single biggest perceived-quality gap for a card game.
- Empty/error states are bare `<p>` tags.

### Engagement gaps (FE-observable)

- No sound, no haptics (`expo-haptics` is one import away in RN), no shoot-the-moon celebration (`meldData.is_shoot_the_moon` is read at `GamePage.tsx:207` but visually identical to any other meld).
- No presence indicators per seat, no "thinking…", no turn timer.
- No chat, no emotes, no reactions.
- No spectator mode.

---

## 3. Back-End (Code & Performance)

### High-impact

**H1. The state machine is in `websocket/handlers.py`.** 1,153 lines: bidding, trump, passing, meld, tricks, scoring, WS I/O, DB persistence, broadcast — all mixed. The pure `engine/` modules are clean, but phase-transition logic lives nowhere central; each handler re-checks the phase string by hand (`handlers.py:99, 160, 268, 404, 491, 679, 809, 983`). This is the #1 tech-debt item and the main blocker for AI opponents, replays, and thorough testing.

Suggested split:
- `engine/state_machine.py` — pure phase transitions
- `engine/actions/` — one pure `(state, payload) -> (state', events)` function per action
- `websocket/handlers.py` — thin I/O adapter

**H2. No optimistic locking on `games.current_state_json`.** The room-level `asyncio.Lock` (`connection_manager.py:32-36`) only serializes one process's WS handlers. Second process, second REST endpoint, or raw `UPDATE` paths (e.g. `SELECT_SEAT` at `handlers.py:118`) all bypass it. No `version` column, no `SELECT FOR UPDATE`. Single-instance today — lost-update bug the moment that changes.

**H3. Single-instance WebSocket fan-out.** `ConnectionManager._rooms` is a module-level dict (`connection_manager.py:113`). `--workers 2` silently breaks multiplayer. Document this as a hard constraint or plan Redis pub/sub.

**H4. `disconnect_times` is a leak and an unbuilt TODO.** Line `connection_manager.py:28-30` literally says "A background task should periodically check these timestamps and forfeit the game" — no such task exists. A disconnecting player with no reconnect blocks the other three indefinitely. Also: `record_disconnect` is called *after* `disconnect()` removes the room (`routes.py:143-144`), so the last player's disconnect record is orphaned.

**H5. AI opponents — not implemented.** Grep for `ai|bot|opponent` in `/app/server` returns only config. The README says "AI-powered Pinochle". This is the single largest engagement gap. A random-legal-move bot on top of `get_legal_cards` is ~80 lines and unblocks solo play.

**H6. `current_state_json` kills analytics.** Migration `0001_create_initial_schema.py` creates `hands`, `bids`, `tricks` tables — **no code writes to them**. Trick history is overwritten at hand boundaries (`handlers.py:1078-1089`). No replay, no leaderboard, no "average bid", no anti-cheat review. Decide before launch.

### Medium

- **M1.** `copy.deepcopy` on every state mutation — small today, grows linearly.
- **M2.** `_login_attempts` and `_failed_join_attempts` dicts grow unboundedly; two workers double the limits.
- **M3.** WS JWT decoded once at connect — never revalidated against expiry.
- **M4.** SQLite-for-tests vs Postgres-in-prod divergence: JSONB operators, enum semantics, timestamp tz, concurrent `UPDATE` behavior are all untested. Add a Postgres-backed CI job.
- **M5.** `0002_add_name_fields.py:21-22` backfills `NOT NULL` string columns with `""` — works, but leaves empty strings masquerading as data.
- **M6.** Inconsistent error shape: WS uses `{event: "ERROR", payload: {message}}` while REST uses FastAPI `{detail}`. No machine-readable `code`. Clients do substring matching.
- **M7.** `PLAY_CARD` payload has no `isinstance(card, str)` check.
- **M8.** Bidding cap of 500 (`handlers.py:355-360`) is arbitrary; rule says 1500 for shoot-the-moon. Document the chosen invariant.

### Security

- Auth (Google OAuth + JWT) and authz (seat ↔ user_id verification on every action) are in the right places.
- **No IDOR found** in WS handlers.
- Atomic seat-claim via `UPDATE ... WHERE col IS NULL` (`handlers.py:117-135`) is the correct pattern.
- CORS env var has no whitespace strip; rate-limit storage is in-memory (see M2).

### Testing gaps
Zero tests for: `PLAY_CARD`, `PASS_CARDS`, `HAND_COMPLETE → BIDDING` re-deal, `GAME_OVER`, the 190-line reconnect snapshot (`routes.py:148-341`), concurrent `SELECT_SEAT`, double-tab races, and several trick-play legal-move edge cases (must-head, trump-when-void).

### Strengths to keep
- **Pure `engine/`** — `tricks.py`, `meld.py`, `scoring.py` are dependency-free and well-tested.
- **Atomic seat claim** via conditional `UPDATE`.
- **Per-room `asyncio.Lock`** — correct for single-instance.
- **`populate_existing=True`** on reloads — shows SQLAlchemy awareness.

---

## 4. Cloud Cost & Infra

### Current spend (~April 2026, Canada Central list prices)

| Resource | Spec | Monthly |
|---|---|---|
| VM `vm-pinochle` | B2s_v2 (2 vCPU, 8 GB) | ~$35–40 |
| OS disk | 30 GB S4 | ~$1.50 |
| Postgres Flex | B1ms + 32 GB + 7-day backups | ~$30–37 |
| Static Public IP | Standard SKU | ~$3.60 |
| Private DNS | 1 zone | ~$0.50 |
| Egress | Hobby traffic | ~$0–2 |
| **Total** | | **~$70–85/mo** (~$840–1,000/yr) |

### Right-sizing

- VM is ~2× oversized. WebSocket fan-out is the bottleneck, not CPU. `B2ats_v2` (~$15) or even `B1s` (~$8) is plenty at current load.
- Public IP ($3.60/mo) is pure overhead for a hobby — Cloudflare Tunnel removes the need for any public IP.
- Postgres Flex B1ms is the cheapest tier; no waste *within* Flex, but the *product choice* is overkill for a game with one JSON column per row.

### Cheaper alternatives (same performance at <100 concurrent players)

| Option | Monthly | Notes |
|---|---|---|
| Hetzner CX22 + SQLite + Cloudflare | **~$4** | ~20× cheaper; lose managed backups |
| Fly.io + Fly Postgres dev | **~$5–8** | Great WS support, generous free tier |
| Azure Container Apps + Neon/Supabase free | **~$0–10** | Scale-to-zero conflicts with persistent WS, so you pin min-replicas=1 |

### Quick wins (no dollar sign is hobby-meaningful if you're on VS Enterprise credits — see below)
1. **[High]** Right-size VM → `B2ats_v2`. Saves ~$20–25/mo, 5-minute reversible change.
2. **[High]** Cloudflare in front (free). Free DDoS + caches `/img/*` + lets you drop the static IP via Tunnel.
3. **[High]** Add Sentry free + Grafana Cloud free before you need them. $0 today, saves hours when something breaks at 2am.
4. **[Medium]** Cut Postgres backup retention 7 → 3 days. Saves ~$2–3/mo.
5. **[Medium]** After right-sizing, consider a 1-yr Reserved Instance (~30–40% off) — but only after sizing is confirmed.

### Scale trajectory

| Concurrent | Bottleneck | Monthly |
|---|---|---|
| 100 | None | ~$70 |
| 1,000 | WS fan-out + DB pool → B4ms + PgBouncer | ~$150–250 |
| 10,000 | Multi-node WS + Redis pub/sub + LB + DB upsize | ~$600–1,500 |

**First thing to break on cost:** adding a second VM + Azure Load Balancer (~$25/mo for the LB itself) the moment one node isn't enough.

### Decisions to surface
1. **Are you on VS Enterprise credits?** If yes, current spend is $0 cash and the "migrate off Azure" analysis is moot. Focus only on monitoring quick win.
2. **12-month user projection?** Hobby forever → Hetzner. Plausible growth → right-size in place.
3. **Is `infra/` Terraform authoritative?** CLAUDE.md says deployment is via Azure CLI due to a provider bug. Drift itself is a cost. Either fix it or delete it.

---

## 5. Engagement & Delight — Feature Ideas

Grouped by effort so a junior-heavy push can pick up the S-tier items immediately.

### Small (≤1 day each)
- Game-over screen with "Rematch / New Game / Back to Lobby".
- Copy-code / share-link / QR on `RoomPage`.
- Persistent trump indicator + cumulative game score on the play surface.
- Bid steppers (+1, +5) replacing the raw number input.
- Sound: card flip, slap, trick sweep, bid chime (WebAudio + 4 samples, with mute toggle + `prefers-reduced-motion` respect).
- Haptics on mobile (`expo-haptics`): pulse on your-turn, thud on illegal play.
- Shoot-the-moon celebration: confetti, banner, custom sound.
- "Who are we waiting on?" name in acknowledge gates.
- Status bar `role="status" aria-live="polite"` for turn and disconnect announcements.

### Medium (1–5 days each)
- AI opponent v1: random-legal-move on top of `get_legal_cards`. Unblocks solo play.
- In-app rules pane / hand-hint tooltips ("must beat", "must follow suit").
- Card animations: deal, flight-on-play, trick collection (~200 LOC of Framer Motion).
- AVIF card assets + sprite option.
- Refactor `lastEvent`/`flushSync` → pub/sub + shared `useGameState` reducer (kills duplication).
- Discriminated-union `WsEvent` + Zod at the boundary.
- Meld drill-down: tap a meld to highlight its cards (teaching moment).
- Spectator mode (read-only WS subscriber).
- Persist `hands`/`bids`/`tricks` rows (tables already exist). Unlocks replays and stats.

### Larger (1+ weeks each)
- Extract state machine from `handlers.py` into pure reducers + transition table. Prerequisite for most below.
- AI v2: difficulty levels, bid modeling, partner inference.
- Matchmaking, ELO, ranked mode.
- Tournament / daily-challenge mode.
- Replays with scrubber.
- Achievements keyed to Pinochle semantics (Double Aces Around, Set the Bid, Shot the Moon).
- Friends list + "play again with these three" on the hand-result screen.

---

## 6. Proposed 90-Day Roadmap

**Weeks 1–2 — Delight sprint.** Game-over screen, copy-invite, trump indicator, persistent game score, sound, haptics, shoot-the-moon celebration, AVIF cards. Small effort, very visible.

**Weeks 3–4 — Solo play.** Random-legal-move AI + a "Play vs. AI" button on the lobby. Add rules pane and bid steppers. First version players can show friends.

**Weeks 5–8 — State machine refactor + persistence.** Extract pure reducers, add `version` column & optimistic locking, write `hands`/`bids`/`tricks` rows. Add disconnect-forfeit task. Backfill tests for `PLAY_CARD` and the reconnect snapshot. Postgres CI job.

**Weeks 9–12 — Replay, stats, spectator.** Leverage the new persistence. Replay viewer, per-user stats page, spectator WS subscription, basic achievements.

Anything beyond week 12 (matchmaking, ranked, tournaments) depends on a real user base, which is what weeks 1–4 exist to attract.

---

## Appendix — Files most referenced

Back-end: `server/app/websocket/handlers.py`, `.../connection_manager.py`, `.../routes.py`, `server/app/api/auth.py`, `.../games.py`, `server/app/models/game.py`, `server/alembic/versions/`, `server/tests/conftest.py`, `server/app/engine/*`.

Front-end (web): `web/src/App.tsx`, `web/src/game/GamePage.tsx`, `web/src/game/{Bidding,Trump,PassCards,Meld,Trick}Phase.tsx`, `web/src/game/HandDisplay.tsx`, `web/src/game/HandResult.tsx`, `web/src/lobby/LobbyPage.tsx`, `web/src/room/RoomPage.tsx`, `web/src/hooks/useWebSocket.ts`.

Front-end (mobile): `mobile/src/game/GameScreen.tsx`, `mobile/src/hooks/useWebSocket.ts`.

Shared: `shared/src/types.ts`, `shared/src/constants.ts`.

Assets: `public/img/` (24 PNGs + `back.svg`).

Infra: `infra/main.tf`, `infra/vm.tf`, `infra/database.tf`, `CLAUDE.md` (Deployment section).
