# AI Pinochle — UX Spec

Design directives for issues #1–#5 and #10. Opinionated defaults; deviate only with reason.

## 1. Brand Identity

**Product name:** "Pinochle" (working); three wordmark directions for the team to pick one:

- **A. "Pinochle Parlor"** — warm, club-feel. Two-word lockup, period after "Parlor.".
- **B. "Pinochle" + pip mark** — single word, with a small diamond/club glyph substituting for the dot on the "i". Modern, logo-like.
- **C. "PN" monogram** — square badge with interlocking P and N forming a pinochle (J♦+Q♠) silhouette. Best for favicon and mobile app icon reuse.

Recommend **B** for the wordmark, **C** for the app icon/favicon so the two read together.

**Palette** (felt-table warmth, avoids the current generic two-greens):

| Role | Name | Hex | Use |
|---|---|---|---|
| Primary | Felt Green | `#0F5132` | Table surface, primary buttons |
| Primary tint | Felt Light | `#1B7A4B` | Hover, highlights |
| Secondary | Brass | `#C9A24B` | Trump badges, winner glow, focus ring |
| Accent warn | Garnet | `#B5302E` | Errors, "set", illegal play |
| Accent cool | Ink Blue | `#1F4E79` | Opposing-team color (EW) |
| Team NS | Brass `#C9A24B` | NS avatars, NS score bar |
| Team EW | Ink Blue `#1F4E79` | EW avatars, EW score bar |
| Neutral 900 | Ink | `#141A1F` | Body text on light |
| Neutral 700 | Slate | `#3A4550` | Secondary text |
| Neutral 300 | Bone | `#E7E1D2` | Card faces, panels on dark |
| Neutral 100 | Parchment | `#F6F1E4` | Page background (light mode) |
| Surface dark | Table | `#0A2A1C` | Play surface background |

Contrast: Bone on Table = 11.8:1, Brass on Table = 7.1:1. All meet AA.

**Typography** (Google Fonts, so engineers can pull with a single link):
- Headline / wordmark: **Fraunces** 600/700 (soft serif, club warmth, variable font).
- Body + UI: **Inter** 400/500/600.
- Numerics (scores, bids, timers): **JetBrains Mono** 500 tabular-nums, so numbers don't jitter as they count up.

**Favicon:** 32×32 + 180×180 Apple-touch. The "PN" monogram in Brass on Table; round-square mask.

**Splash / loading screen:**
- Full-bleed Table green.
- Centered monogram, 96 px, fades in 150 ms.
- Below it, a single thin Bone-colored progress bar (2 px tall, 120 px wide) that slides left-to-right looped in 1.2 s — *not* a spinner.
- Copy: "Shuffling…" in Inter 500, Bone 80 % alpha.
- Route-level loader: same bar only, no monogram, anchored under the top nav.

## 2. Motion Language

Single easing vocabulary. Do not introduce new curves.

- `ease-out-card`: `cubic-bezier(0.22, 0.61, 0.36, 1)` — default for card movement.
- `ease-in-out-soft`: `cubic-bezier(0.45, 0, 0.35, 1)` — phase transitions.
- `ease-spring-snap`: `cubic-bezier(0.2, 1.4, 0.4, 1)` — trick collection.

**Deal sequence** (48 cards, 4-at-a-time per rules):
- Each card: 220 ms travel from deck origin to seat target.
- Stagger: 55 ms between cards, going clockwise N → E → S → W, four cards per seat per pass, three passes.
- Total deal: ~2.9 s. Cards arrive face-down except the local player's, which flip (200 ms Y-rotate) on arrival.
- Deck origin: center of table. Scale 1.0 → 1.0; no shrink.

**Play flight** (card from hand to trick center):
- 320 ms, `ease-out-card`.
- Slight arc: peak 18 px above the straight-line midpoint.
- Rotation: randomized ±6° on land, deterministic per seat (N=−4°, E=+6°, S=+3°, W=−6°) so the pile looks stacked, not aligned.
- Face-up flip on arrival for opponents' cards: 180 ms at the 60 % mark of the flight.

**Trick collection sweep**:
- Trigger: 2 s after the 4th card lands (preserves the existing pause).
- Four cards glide as a group toward the *winning team's* side:
  - NS winner: slide to bottom-center, 420 ms.
  - EW winner: slide to right edge, 420 ms (mirror for left if EW avatars are split).
- During glide, cards compress into a stack with 3 px Y offset each. Final 60 ms uses `ease-spring-snap` so they settle with a small overshoot.
- The winning team's score chip pulses (scale 1 → 1.08 → 1, 280 ms) at the moment the stack lands.

**Reduced motion** (`prefers-reduced-motion: reduce`): disable arc, flips, spring, and stagger. Cards cross-fade in place over 120 ms. Trick sweep becomes an instant opacity swap with a 200 ms score-chip flash. Haptics and sound remain unless muted.

## 3. Shoot-the-Moon Moments

Three distinct moments — must look and feel clearly different.

**Moment A — Declaration** (trump named with moon flag, fired on `TRUMP_NAMED` + `is_shoot_the_moon`):
- Banner slides down from top, 320 ms, 64 px tall, Garnet background, Brass text: "{Bidder} is shooting the moon — 1500 to win, 0 to set."
- Banner stays 3 s then auto-collapses to a persistent Brass "MOON" chip next to the trump indicator for the rest of the hand.
- Sound: single low gong, 1.2 s decay (sample `moon_call.ogg`), −6 dB.
- Haptic: `Notification.Warning` (a double-tap pattern) — tension, not celebration.

**Moment B — Success** (bidding team takes all 12 tricks):
- Triggered on the 12th `TRICK_COMPLETED` where the bidding team won. Fire *before* the hand-result screen.
- Full-viewport confetti burst (Brass + Bone + Felt Light), 2.8 s, 180 particles, from bottom two corners, gravity 0.4, wind ±30.
- Centered banner: "SHOT THE MOON" in Fraunces 700, 72 px, Brass, with a slow 3 % scale bob (1.4 s loop) for the duration.
- Subtitle: "+1500 to {Team}".
- Sound: ascending brass fanfare (3 notes, ~1.4 s), then a cymbal swell under the banner (total 2.6 s). −3 dB (loudest event in the app).
- Haptic: `Notification.Success`, followed by three `Impact.Heavy` pulses spaced 180 ms apart.
- Hand-result screen that follows shows the bid row highlighted in Brass with a "★ Moon" tag.

**Moment C — Failed moon** (bidding team drops any trick):
- Triggered on the *first* non-bidding-team trick win after moon was declared — do not wait for hand end; the moment lands harder when you see the moon die.
- The losing trick's card sweep reverses briefly (200 ms pull toward the winning team), then a Garnet flash across the trump/MOON chip.
- Overlay banner: "MOON FAILED" in Fraunces 700, 48 px, Garnet with a Bone backdrop, 1.4 s.
- Subtitle: "{Team} is set."
- Sound: descending minor-third, muted (sample `moon_fail.ogg`), 900 ms, −8 dB. No cymbal.
- Haptic: single `Impact.Heavy`, then `Notification.Error` 120 ms later.
- MOON chip stays on screen but desaturates to 40 % through hand end — a visible tombstone.

## 4. Sound Design

All samples ship as 48 kHz mono OGG ≤ 40 KB each. One `AudioContext`, preloaded on first user gesture. **Default: ON** on desktop (ambient-friendly), **OFF** on mobile web (bandwidth + surprise). Setting persists in `localStorage`.

| Event | Trigger | Character | Length | Volume (relative) |
|---|---|---|---|---|
| `card_deal` | Each dealt card | Short paper flick | 80 ms | 0.35 |
| `card_flip` | Local hand reveal, opponent play reveal | Soft riffle | 120 ms | 0.45 |
| `card_play` | `CARD_PLAYED` (self or other) | Dry slap on felt | 140 ms | 0.6 |
| `card_illegal` | `ERROR` with `ILLEGAL_PLAY` | Muted thud | 180 ms | 0.55 |
| `trick_sweep` | Trick collection start | Low whoosh | 420 ms | 0.5 |
| `trick_win_self` | Your team took the trick | Short wooden click + glint | 240 ms | 0.7 |
| `bid_chime` | Your `BIDDING_TURN` | Clear bell (C5) | 300 ms | 0.6 |
| `bid_pass` | Any player passes | Short low tick | 90 ms | 0.35 |
| `trump_named` | `TRUMP_NAMED` | Warm pad chord | 800 ms | 0.5 |
| `meld_reveal` | `MELD_BROADCAST` | Shimmering riser | 600 ms | 0.45 |
| `your_turn` | `YOUR_TURN` (play phase) | Two-note pip | 260 ms | 0.55 |
| `hand_complete` | `HAND_COMPLETED` | Soft resolve chord | 900 ms | 0.55 |
| `game_win` | `GAME_OVER`, your team wins | Triumphant 4-note phrase | 1.6 s | 0.85 |
| `game_lose` | `GAME_OVER`, other team wins | Reflective descending phrase | 1.4 s | 0.55 |
| `moon_call` | Moon declaration | Low gong | 1.2 s | 0.55 |
| `moon_success` | Moon success | Brass fanfare + cymbal | 2.6 s | 1.0 |
| `moon_fail` | Moon failed | Muted minor descent | 900 ms | 0.45 |

**Volume hierarchy (loudest → quietest):** moon_success > game_win > trick_win_self > bid_chime ≈ card_play > everything else. No simultaneous plays above 0.6 combined; duck overlapping effects to 70 %.

**Settings UX:** a speaker icon in the top nav, next to the user menu.
- Single click: toggle mute (icon slashes, aria-pressed).
- Long-press / click the adjacent caret: volume slider (0–100, default 70) and a "Haptics" toggle on mobile.
- Mute state announced to screen readers via `aria-label="Sound off"` swap and a polite live-region confirmation: "Sound muted."
- Respect `prefers-reduced-motion` by auto-muting the two longest cues (`meld_reveal`, `moon_success` cymbal tail) unless user has explicitly unmuted.

## 5. Haptic Design (mobile)

Using `expo-haptics`. **Default: ON**, toggleable in the same settings menu as sound. No haptics for spectators.

| Event | Pattern |
|---|---|
| `YOUR_TURN` (play phase) | `ImpactFeedbackStyle.Medium` |
| `BIDDING_TURN` (your bid) | `Selection` then `Impact.Light` 90 ms later |
| Tap card to select | `Selection` |
| `CARD_PLAYED` (self) | `Impact.Light` |
| `CARD_PLAYED` (other) | none (avoid buzz spam) |
| `ILLEGAL_PLAY` error | `NotificationFeedbackType.Error` |
| Trick won by your team | `Impact.Medium` |
| Trick lost | none |
| `TRUMP_NAMED` (you named it) | `Impact.Heavy` |
| Passing cards submitted | `Selection` + `Impact.Light` |
| Moon declared | `Notification.Warning` |
| Moon success | `Notification.Success` + 3×`Impact.Heavy` @ 180 ms |
| Moon failed | `Impact.Heavy` + `Notification.Error` @ 120 ms |
| `HAND_COMPLETED` | `Impact.Light` |
| `GAME_OVER` — you win | `Notification.Success` + `Impact.Heavy` ×2 |
| `GAME_OVER` — you lose | `Impact.Medium` once |
| Reconnect success | `Selection` |

Never fire haptics when app is backgrounded. Debounce same-event repeats within 80 ms.

## 6. Empty / Error / Loading States

Every surface below needs the full triad. Template:

- **Empty:** centered 96 px illustration (card fan for play, envelope for invites, magnifier for search), headline in Fraunces 600 24 px, one sentence of body copy in Inter 400 16 px Slate, one primary CTA. No more.
- **Error:** Garnet icon (16 px), specific message with the error `code` mapped to human text, one retry action, one secondary "Get help" link. Never "Something went wrong."
- **Loading:** skeleton shapes that match final layout for anything > 200 ms; the Bone progress bar under the nav for route changes; inline spinner (14 px, 2 px stroke, Brass) only for in-button waits.

| Screen | Current gap | Template to apply |
|---|---|---|
| `LoginPage` | No loading while Google OAuth resolves | Button-inline spinner + disable; full-screen splash if > 800 ms |
| `RegisterPage` | Field errors are bare `<p>` | Inline Garnet helper text with icon, aria-describedby |
| `LobbyPage` | No empty state for "no games yet" | Empty illo + "Create a room" CTA |
| `MyGamesPage` | No empty, no loading; 5-col mobile break | Empty "No games yet — your history will show here." + mobile card list |
| `RoomPage` | No loading on create, no copy-code feedback | Skeleton seats while loading; toast "Code copied" on copy |
| `RoomPage` waiting seats | Plain text only | Illustrated "Waiting for players (2/4)" with share-link card |
| `GamePage` (`LOBBY_WAITING`) | "Game Over" label mismatch | Dedicated waiting panel + "Who are we waiting on?" list |
| `BiddingPhase` | No explanation, no empty-action state | Skeleton for other bidders' turn; rules tooltip |
| `TrumpPhase` | Moon checkbox has no context | Info callout above checkbox with moon description |
| `PassCardsPhase` | Already good — keep as reference | — |
| `MeldPhase` | Numbers only when others acknowledge | Per-seat skeleton card + "Waiting on East" |
| `TrickPhase` | No loading after play | Optimistic state already there; add connection-lost banner template |
| `HandResult` | `#888` contrast fail; "OK" microcopy | Fix text to Ink on Bone; button "Next hand" |
| `GameOverScreen` | Missing overall — exists as shell | Trophy illo, team scores in tabular-nums, "Rematch" primary + "Back to lobby" secondary |
| Generic WS error | Toast only, substring-matched | Toast styled by `ErrorCode`; persistent banner on reconnect failure |
| Connection lost | Reconnect overlay exists (good) | Add "Reconnecting… attempt 2 of 5" counter |

## 7. Accessibility Checklist

Non-negotiable for every issue in this spec:

- All text meets WCAG AA (4.5:1 body, 3:1 large). Remove `#888`/`#aaa` on dark panels; replace with Bone at ≥ 80 % alpha.
- Every animation respects `prefers-reduced-motion` via the rules in §2. Confetti caps at 30 particles with no physics under reduced motion.
- Every sound has a visual equivalent (banner, badge, or chip). Deaf players lose nothing.
- Mute toggle reachable by keyboard, labelled, announces state change.
- Haptics toggle reachable in the same menu; default ON but one tap to disable.
- All new interactive elements use real `<button>` (not `<img role="button">`), have a 2 px Brass focus ring with 2 px offset, and survive tabbing through the play surface in seat order (self → left → partner → right).
- Status updates (`YOUR_TURN`, `TRUMP_NAMED`, moon moments, reconnect) go through a single `role="status" aria-live="polite"` region; the moon-fail and error states use `aria-live="assertive"`.
- Focus is moved to the new primary action after each phase transition (bid input, trump buttons, pass submit, play hand, next-hand button, rematch button).
- Color is never the sole cue: trump marked with a badge glyph, legal-card cue adds a Brass dot, team colors pair with initials (NS/EW) on every chip.
- Card images include per-card `alt` only in the active hand; face-down decorative cards get `alt=""` with one summary label on the wrapper.
- Confetti canvas is `aria-hidden`; moon banners carry the textual announcement.

## 8. Card Image Pipeline (UX acceptability)

From a visual-quality standpoint both options are acceptable; the deciding factor is flicker, not fidelity.

- **AVIF (preferred):** crisp at 2× display size, preserves subtle card-art gradients, allows per-card animated flips without seams. Preload `back.avif` and the local player's 12 cards on `HAND_DEALT` to eliminate first-play pop-in. Visually identical to the current PNGs at a fraction of the weight — design-approved.
- **Sprite sheet:** one HTTP request, zero flicker, deterministic paint. Risk: the CSS `background-position` flip animation requires a matching back-face in the same sheet or a layered element; if engineering can guarantee a clean flip, this is equally acceptable and slightly better for deal-sequence smoothness on low-end Android.

Recommendation: **AVIF with preloading** for web; keep the sprite option in reserve for the mobile RN build if flip perf suffers. Either way, set explicit `width`/`height` to prevent CLS, and make `back` render identically across both pipelines.
