# Telestrations Web App -- Product Specification

**Version:** 1.0
**Date:** 2026-04-23
**Status:** Draft

---

## Table of Contents

1. [Overview](#1-overview)
2. [Target Audience and Constraints](#2-target-audience-and-constraints)
3. [Game Concepts and Terminology](#3-game-concepts-and-terminology)
4. [User Roles](#4-user-roles)
5. [Game Lifecycle](#5-game-lifecycle)
6. [Detailed Feature Specifications](#6-detailed-feature-specifications)
   - 6.1 [Landing Page](#61-landing-page)
   - 6.2 [Game Creation](#62-game-creation)
   - 6.3 [Lobby / Waiting Room](#63-lobby--waiting-room)
   - 6.4 [Gameplay: Prompt Phase](#64-gameplay-prompt-phase)
   - 6.5 [Gameplay: Drawing Phase](#65-gameplay-drawing-phase)
   - 6.6 [Gameplay: Guessing Phase](#66-gameplay-guessing-phase)
   - 6.7 [Round Transitions](#67-round-transitions)
   - 6.8 [Review Phase](#68-review-phase)
   - 6.9 [Post-Game](#69-post-game)
7. [Drawing Tool Specification](#7-drawing-tool-specification)
8. [Timer Behavior](#8-timer-behavior)
9. [Connection and State Management](#9-connection-and-state-management)
10. [Edge Cases and Error Handling](#10-edge-cases-and-error-handling)
11. [Mobile-First Design Requirements](#11-mobile-first-design-requirements)
12. [Infrastructure and Deployment](#12-infrastructure-and-deployment)
13. [Data Model Summary](#13-data-model-summary)
14. [Non-Functional Requirements](#14-non-functional-requirements)
15. [Out of Scope for v1](#15-out-of-scope-for-v1)

---

## 1. Overview

Telestrations is a party game that combines drawing and guessing in a "telephone" style chain. Each player starts with a word or phrase, draws it, then passes it to the next player who guesses what the drawing represents, then the next player draws that guess, and so on. The humor comes from how the original prompt mutates as it passes through the chain.

This product is a web-based implementation designed for in-person or remote groups of friends. There is no app store download -- players simply open a URL in their phone or laptop browser.

---

## 2. Target Audience and Constraints

| Attribute | Detail |
|---|---|
| Max concurrent players per game | 20 |
| Min players to start | 4 |
| Recommended players | 4--8 |
| Target devices | Mobile phones (primary), tablets, laptops |
| Hosting | Azure (low-cost tier) |
| Cost target | Minimal -- no persistent database required outside of active games |
| Authentication | None -- display name only |
| Monetization | None (personal/hobby project) |

---

## 3. Game Concepts and Terminology

- **Game**: A single session identified by a unique game code. A game contains one full cycle of prompt/draw/guess rounds.
- **Game Code**: A short, human-friendly code used to join a game (e.g., `FROG`).
- **Host**: The player who created the game. Has control over game flow.
- **Player**: Anyone who has joined the game, including the host.
- **Chain (Notebook)**: The sequence of prompts, drawings, and guesses that originated from one player's initial prompt. There are as many chains as there are players.
- **Round**: A single phase where every player simultaneously performs one action (write a prompt, draw, or guess). All players act in the same round at the same time.
- **Prompt Phase**: The first round, where each player writes a word or phrase.
- **Drawing Phase**: A round where each player draws a picture based on the text they received.
- **Guessing Phase**: A round where each player writes a text guess based on the drawing they received.
- **Review Phase**: After all rounds are complete, the group views each chain from original prompt to final entry.

---

## 4. User Roles

### 4.1 Host

- Creates the game and receives the game code.
- Configures game settings (timer durations, number of rounds).
- Controls the game flow: starts the game, can advance through review chains.
- Is also a regular player during gameplay.
- If the host leaves, host privileges transfer (see section 10).

### 4.2 Player (Non-Host)

- Joins via game code and display name.
- Participates in all gameplay phases.
- Can view results during review phase.
- Cannot control game flow.

---

## 5. Game Lifecycle

The game progresses through these states in order:

```
LOBBY --> PROMPT --> [DRAW --> GUESS]* --> REVIEW --> ENDED
```

### 5.1 State Diagram

1. **LOBBY** -- Players join and wait. Host configures settings.
2. **PROMPT** -- All players write an initial word or phrase.
3. **DRAW** -- Each player draws the prompt/guess they received.
4. **GUESS** -- Each player writes a guess for the drawing they received.
5. Steps 3--4 repeat until the chain has passed through all players (or the configured number of rounds is reached).
6. **REVIEW** -- All players view completed chains together.
7. **ENDED** -- Game is over. Players can return to the landing page or the host can start a new game with the same group.

### 5.2 Number of Rounds

The total number of rounds (excluding the initial prompt) equals the number of players minus one. For example, with 6 players:

- Round 0: Prompt (everyone writes a word)
- Round 1: Draw (draw the prompt you received)
- Round 2: Guess (guess the drawing you received)
- Round 3: Draw
- Round 4: Guess
- Round 5: Draw

This results in 5 rounds after the prompt, and each chain contains 6 entries total (1 prompt + 5 draw/guess alternations).

With an even number of players, the chain ends on a drawing. With an odd number, it ends on a guess. Both are fine.

### 5.3 Chain Passing Mechanic

Chains rotate through players in a fixed order determined at game start. The server assigns each player a number (1 through N). In each round, player P receives the chain that originated from player `(P - round_number) mod N`. This ensures:

- Every player contributes to every chain exactly once.
- No player ever sees their own chain until the review phase.
- Each chain passes through all N players.

---

## 6. Detailed Feature Specifications

### 6.1 Landing Page

**URL:** Root URL of the application (e.g., `https://telestrations.example.com`)

**Layout (mobile-first):**

- App title/logo at the top.
- Two prominent buttons stacked vertically:
  - **"Create Game"** -- navigates to game creation.
  - **"Join Game"** -- presents a game code input field and display name field.
- Minimal footer with a link to rules/how-to-play.

**Join Game Flow:**

1. Player taps "Join Game."
2. A form appears with two fields:
   - **Game Code** (4 uppercase letters, auto-capitalized). Input is validated client-side: exactly 4 letters, no numbers or special characters.
   - **Display Name** (2--16 characters, alphanumeric plus spaces). Must be unique within the game -- server rejects duplicates with an error message.
3. Player taps "Join."
4. If the code is valid and the game is in the LOBBY state, the player enters the lobby.
5. If the code is invalid, the game has already started, or the game is full (20 players), an appropriate error message is displayed:
   - "Game not found. Check your code and try again."
   - "This game has already started."
   - "This game is full."

### 6.2 Game Creation

**Flow:**

1. Host taps "Create Game" on the landing page.
2. Host enters their display name (same validation as join: 2--16 characters).
3. Host is presented with optional settings (with sensible defaults pre-selected):
   - **Drawing Timer**: 60 seconds (options: 30, 45, 60, 90, 120 seconds)
   - **Guessing Timer**: 30 seconds (options: 15, 20, 30, 45, 60 seconds)
   - **Prompt Timer**: 30 seconds (options: 15, 20, 30, 45, 60 seconds)
   - **Use All Rounds**: On by default. When on, the number of rounds equals (players - 1). When off, the host can set a custom round count (minimum 2, maximum players - 1). Useful for large groups where full rotation would take too long.
4. Host taps "Create."
5. Server generates a unique 4-letter game code (see 6.2.1) and creates the game in LOBBY state.
6. Host is taken to the lobby screen.

#### 6.2.1 Game Code Format

- 4 uppercase English letters, e.g., `FROG`, `LAMP`, `QUIZ`.
- Excludes visually ambiguous characters: `I`, `O`, `L` are excluded (too similar to 1, 0, L/I in some fonts). Available letters: `A B C D E F G H J K M N P Q R S T U V W X Y Z` (22 letters).
- Generated server-side; uniqueness is checked against currently active games.
- Total possible codes: 22^4 = 234,256 -- more than sufficient for concurrent games.
- Codes are recycled once a game reaches the ENDED state and is cleaned up.

### 6.3 Lobby / Waiting Room

The lobby is a shared waiting room visible to all players who have joined.

#### 6.3.1 Host View

- **Game Code** displayed prominently at the top in a large, copy-friendly format with a "Copy" button and a "Share" button (uses the Web Share API on mobile, falls back to copy-link).
- **Share Link**: `https://telestrations.example.com/join?code=FROG` -- pre-fills the code on the join page.
- **Player List**: Shows all connected players with their display names. The host is labeled "(Host)" or shown with a crown icon. Players are listed in join order.
- **Player Count**: "4 of 20 players" with an indicator of minimum met (4+).
- **Settings Panel**: The host can still adjust timer durations and round settings while in the lobby.
- **"Start Game" Button**: Enabled only when 4 or more players have joined. Disabled with a tooltip "Need at least 4 players" when fewer are present.
- **"Remove Player" option**: Host can tap a player's name to remove them from the lobby. The removed player sees a message "You have been removed from the game by the host" and is returned to the landing page.

#### 6.3.2 Player (Non-Host) View

- **Game Code** displayed (so they can share it with others).
- **Player List**: Same list as host sees, but without remove-player controls.
- **"Waiting for host to start the game..."** message.
- **"Leave Game" Button**: Returns the player to the landing page.

#### 6.3.3 Lobby Behavior

- New players joining appear in real time for all users.
- Players leaving (voluntarily or via disconnect) are removed from the list in real time.
- If a player with the same display name tries to join, the server rejects the request with "That name is already taken. Choose a different name."
- The lobby has no timeout -- it remains open indefinitely until the host starts the game or all players leave.

### 6.4 Gameplay: Prompt Phase

**Trigger:** Host taps "Start Game" in the lobby.

**What happens:**

1. The server locks the player list. No new players can join once the game has started.
2. All players see a screen transition to the prompt phase.
3. Each player sees:
   - Instructions: "Write a word or phrase for someone to draw!"
   - A text input field (1--80 characters).
   - A countdown timer (default 30 seconds).
   - A "Submit" button.
4. When a player submits their prompt, the input is locked and they see "Waiting for other players..." with a list showing who has and hasn't submitted (checkmarks next to names).
5. When all players have submitted, or the timer expires, the round ends.

**Timer Expiration Behavior:**

- If a player has not submitted when the timer reaches 0, the system auto-submits whatever text is in the field.
- If the field is empty, the system assigns a random prompt from a built-in word list (e.g., "elephant", "birthday party", "skydiving"). The player sees a brief toast notification: "Time's up! A random prompt was assigned."

### 6.5 Gameplay: Drawing Phase

**Trigger:** Automatic transition after the prompt phase or a guessing phase ends.

**What each player sees:**

1. The text prompt or guess they need to draw, displayed at the top of the screen in a highlighted box.
2. A drawing canvas (see section 7 for drawing tool details).
3. A countdown timer.
4. A "Done" button to submit early.
5. The round number (e.g., "Round 2 of 5").

**Behavior:**

- The player draws a picture that represents the text they were given.
- When the player taps "Done" or the timer expires, the drawing is captured and submitted.
- If the timer expires and the canvas is blank, a blank canvas is submitted (this is acceptable -- it just makes the chain funnier).
- After submission, the player sees "Waiting for other players..." with submission status.
- The round advances when all players have submitted or the timer expires for all players.

### 6.6 Gameplay: Guessing Phase

**Trigger:** Automatic transition after a drawing phase ends.

**What each player sees:**

1. The drawing from the previous player, displayed as a static image that fills most of the screen.
2. A text input field below the drawing (1--80 characters).
3. A countdown timer.
4. A "Submit" button.
5. The round number.

**Behavior:**

- The player types their best guess of what the drawing represents.
- On submit or timer expiry, the guess is captured.
- If the timer expires and the field is empty, the system submits "???" as the guess.
- After submission, player sees "Waiting for other players..." with submission status.
- The round advances when all players have submitted or the timer expires.

### 6.7 Round Transitions

**Between every round:**

1. A brief transition screen (2--3 seconds) is shown:
   - "Round X complete!"
   - "Get ready to [draw / guess]..."
   - A brief animation or countdown ("3... 2... 1...").
2. This gives players a mental break and sets expectations for the next action.
3. The transition is controlled by the server clock to keep all players synchronized.

**Host Fast-Forward:**

- During the "Waiting for other players..." phase, if all but one player have submitted, the host sees an additional option: "End round early" which immediately expires the timer for all players. This prevents one slow player from holding up the group. The slow player's current input (partial drawing, partial text) is submitted as-is.

### 6.8 Review Phase

**Trigger:** The final round completes.

**Overview:**

The review phase is the payoff. The group views each chain from start to finish, seeing how the original prompt evolved (or devolved) through each player's interpretation.

**Flow:**

1. A splash screen appears: "Time to see the results!" with a short delay (2 seconds).
2. Chains are presented one at a time. The host controls navigation.
3. For each chain:
   - Header: "Started by [Player Name]"
   - Entries are revealed one at a time (host taps "Next" to reveal each entry):
     - **Prompt entry**: Shows the original text in a card format with the author's name.
     - **Drawing entry**: Shows the drawing in a card format with the artist's name.
     - **Guess entry**: Shows the guess text in a card format with the guesser's name.
   - After all entries in a chain are revealed, the host taps "Next Chain" to move to the next chain.
4. All players see the same view simultaneously (the host's screen drives the state).
5. After the final chain is reviewed, a "Game Over" screen appears.

**Player Experience During Review:**

- All players see the chain content simultaneously, controlled by the host.
- Players cannot skip ahead or navigate independently.
- Each entry reveal should have a brief animation (fade-in or slide-in) for dramatic effect.

#### 6.8.1 Review Navigation

The host has the following controls (not visible to other players as interactive elements -- other players just see the content):

- **"Next" button**: Reveals the next entry in the current chain.
- **"Next Chain" button**: Appears after all entries in the current chain are revealed. Moves to the next chain.
- **"Previous" button**: Goes back one entry or to the previous chain.
- **Chain indicator**: "Chain 3 of 6" displayed at the top.

### 6.9 Post-Game

**After the final chain is reviewed:**

1. A summary screen appears:
   - "Game Over!" header.
   - **"Play Again" button** (host only): Creates a new game with the same group. All players are moved to a new lobby automatically. The game code changes.
   - **"Download Results" button** (all players): Downloads all chains as a single image gallery (a vertical strip of images per chain, or a ZIP file containing individual images). Drawing entries are saved as PNGs; text entries are rendered as simple text-on-white-background images.
   - **"Home" button** (all players): Returns to the landing page.
2. The game data remains available for download for 10 minutes after the game ends, then is deleted from the server.

---

## 7. Drawing Tool Specification

### 7.1 Canvas

- **Aspect Ratio**: 1:1 (square). This works well on both portrait-mode phones and landscape desktops.
- **Resolution**: The canvas renders at 400x400 CSS pixels, but captures at 800x800 actual pixels (2x for retina displays). On smaller screens, the canvas scales down proportionally but always maintains its aspect ratio.
- **Background**: White.
- **Touch Support**: Full touch drawing support. Single-finger draw, two-finger pinch/zoom is disabled to prevent accidental zooming.

### 7.2 Tools

The drawing toolbar is displayed below the canvas on mobile (to keep thumbs close) and to the side on desktop.

| Tool | Behavior | Icon |
|---|---|---|
| **Pen** | Freehand drawing. Default tool. Smooth line interpolation for finger drawing. | Pencil icon |
| **Eraser** | Draws in white (same as background). Same size options as pen. | Eraser icon |
| **Color Picker** | A palette of 12 preset colors (no custom color picker to keep it simple): black, dark gray, red, orange, yellow, green, light blue, dark blue, purple, pink, brown, white. Default: black. | Colored circle |
| **Size Selector** | 3 brush sizes: small (3px), medium (6px), large (12px). Default: medium. Shown as 3 circles of increasing size. | Circle size indicators |
| **Undo** | Undoes the last stroke (not pixel-by-pixel, but full stroke). Supports up to 50 undo levels. | Curved arrow |
| **Redo** | Redoes the last undone stroke. | Forward curved arrow |
| **Clear** | Clears the entire canvas. Requires confirmation ("Clear the whole canvas?") via a small modal or long-press to prevent accidental clears. | Trash icon |

### 7.3 Drawing Data

- Drawings are stored as PNG images (base64-encoded) rather than stroke data.
- When a player submits, the canvas is exported to a PNG and sent to the server.
- Maximum expected size per drawing: ~50--150 KB as a compressed PNG.
- Stroke data is not persisted server-side. Only the final image is stored.

### 7.4 Drawing UX Considerations

- **Palm rejection**: On touch devices, disable drawing from touches that originate at the very edge of the canvas (likely palm contact).
- **Viewport locking**: When the canvas is active, prevent page scrolling to avoid accidental scroll-while-drawing.
- **Line smoothing**: Apply a simple Bezier curve smoothing algorithm to raw touch/mouse input so drawings don't look jagged.
- **Minimum stroke**: A single tap should produce a dot (filled circle at the current brush size).

---

## 8. Timer Behavior

### 8.1 Timer Display

- A countdown timer is prominently displayed at the top of the screen during all timed phases.
- Format: `MM:SS` when 60 seconds or more; `SS` when under 60 seconds.
- The timer changes color when 10 seconds or fewer remain (e.g., turns red).
- At 5 seconds remaining, the timer pulses or flashes to create urgency.

### 8.2 Timer Synchronization

- The server is the authoritative source for the timer. The server sends the round start time and duration to all clients.
- Clients compute their own countdown locally based on the server-provided start time, accounting for the clock offset measured during the WebSocket handshake.
- The server enforces the deadline: submissions received after the deadline are rejected (the auto-submission value is used instead).

### 8.3 Grace Period

- There is a 2-second grace period after the displayed timer reaches 0. This accounts for network latency and allows last-moment submissions to be accepted.
- The grace period is not shown to the user; the timer simply shows "0:00" and then transitions.

### 8.4 Auto-Submission Rules

| Phase | Field State at Timer Expiry | Auto-Submission |
|---|---|---|
| Prompt | Text entered | Submit the entered text |
| Prompt | Empty | Submit a random word from the built-in word list |
| Drawing | Canvas has strokes | Submit the current canvas state |
| Drawing | Canvas is blank | Submit a blank white canvas |
| Guessing | Text entered | Submit the entered text |
| Guessing | Empty | Submit "???" |

---

## 9. Connection and State Management

### 9.1 Communication Protocol

- **WebSocket** for all real-time communication (game state updates, timer sync, player join/leave events, round transitions, submission notifications).
- **HTTP REST** for initial game creation, joining a game, and downloading results.
- The WebSocket connection is established when a player enters the lobby and maintained throughout the game.

### 9.2 Client State Persistence

- The client stores the following in `sessionStorage`:
  - Game code
  - Player ID (server-assigned UUID)
  - Player display name
  - Reconnection token (a server-issued opaque token)
- This allows reconnection after a page refresh within the same browser tab/session.

### 9.3 Reconnection Flow

1. On page load, the client checks `sessionStorage` for a reconnection token.
2. If found, the client sends a reconnect request to the server via WebSocket with the token.
3. The server validates the token and checks if the game is still active.
4. If valid:
   - The player is restored to their position in the game.
   - If the current round is still in progress, the player receives the current round data and remaining time.
   - If the player missed a round while disconnected, their entry is auto-submitted per the rules in section 8.4.
5. If invalid (game ended, token expired): the client clears `sessionStorage` and shows the landing page.

### 9.4 Heartbeat

- The client sends a WebSocket ping every 10 seconds.
- If the server does not receive a ping for 30 seconds, the player is marked as disconnected.
- Disconnected players are shown with a "disconnected" indicator (gray name, small disconnected icon) in the player list.
- If a disconnected player does not reconnect within 60 seconds, they are treated as having left the game. Their entries are auto-submitted for remaining rounds.

---

## 10. Edge Cases and Error Handling

### 10.1 Host Disconnects

- If the host disconnects during the **lobby**: the game remains open. If the host does not reconnect within 60 seconds, host privileges are transferred to the next player who joined (by join order). That player sees a notification: "You are now the host." If no players remain, the game is deleted.
- If the host disconnects during **gameplay**: the game continues normally since gameplay is timer-driven and server-managed. The host's entries are auto-submitted if they miss rounds. If the host reconnects, they resume as a normal player.
- If the host disconnects during the **review phase**: host controls transfer to the next player in join order so the review can continue.

### 10.2 Player Disconnects Mid-Game

- The player's current round entry is auto-submitted when the timer expires (per section 8.4 rules).
- For all subsequent rounds, the disconnected player's entries are auto-submitted immediately at the start of each round (blank canvas for draw, "???" for guess).
- The chain still passes through the disconnected player's "slot" -- their auto-submitted entries are included in the chain.
- If the player reconnects, they rejoin at the current round and participate normally from that point forward.

### 10.3 Player Leaves Voluntarily Mid-Game

- Same behavior as disconnect. The player's remaining entries are auto-submitted.
- The player cannot rejoin the same game after voluntarily leaving during gameplay.

### 10.4 Browser Refresh / Tab Close

- On refresh: the client checks `sessionStorage` for reconnection data and attempts to reconnect (see section 9.3).
- On tab close: the `beforeunload` event sends a disconnect signal to the server. The server starts the 60-second reconnection window.
- If the player opens the game URL in a new tab while their old session is still active, the old session is terminated and the new tab takes over.

### 10.5 Insufficient Players

- If too many players disconnect or leave during the game and fewer than 3 active players remain, the game continues but a warning is displayed: "Some players have left. The game will continue but chains may be less fun."
- The game does not abort. Chains still rotate through all original player slots, with disconnected players' entries being auto-submitted.
- Minimum players to *start* a game is 4, but once started, the game always plays through to completion.

### 10.6 All Players Leave

- If all players disconnect from an active game, the server waits 2 minutes for reconnections. If no one reconnects, the game is deleted.

### 10.7 Concurrent Games

- A player can only be in one active game at a time (tracked by browser session). Attempting to join a second game shows: "You are already in a game. Leave your current game first."

### 10.8 Network Errors

- If the WebSocket connection drops unexpectedly, the client shows a banner: "Connection lost. Reconnecting..." and attempts to reconnect every 3 seconds for up to 60 seconds.
- If reconnection fails after 60 seconds, the client shows: "Unable to reconnect. You may have been removed from the game." with a "Return Home" button.

---

## 11. Mobile-First Design Requirements

### 11.1 General Principles

- **Touch targets**: All interactive elements are at least 44x44px (Apple's minimum recommendation).
- **Font sizes**: Minimum 16px for body text (prevents iOS auto-zoom on input focus).
- **Viewport**: The app sets `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">` to prevent pinch-zoom interference, especially during drawing.
- **Orientation**: The app works in both portrait and landscape, but is optimized for portrait mode on phones.
- **No hover states**: All interactions are tap-based. Hover effects are aesthetic-only enhancements on desktop.

### 11.2 Layout Strategy

- Single-column layout on screens under 768px wide.
- Two-column layout available on wider screens (e.g., drawing tools beside the canvas on desktop).
- Bottom-anchored action buttons (Submit, Done) so they are thumb-accessible.
- The keyboard does not obscure input fields -- the view scrolls or repositions when the soft keyboard opens.

### 11.3 Drawing on Mobile

- The drawing canvas takes up the maximum available width, minus small margins (16px on each side).
- The toolbar sits directly below the canvas. Tool icons are arranged in a single horizontal row with horizontal scrolling if needed.
- During drawing, the browser's pull-to-refresh gesture is disabled.
- The browser's back-swipe gesture (iOS Safari) is suppressed while on the canvas using `touch-action: none` on the canvas element.

### 11.4 Performance

- Target 60fps during drawing on mid-range phones (e.g., iPhone SE, Galaxy A-series).
- Canvas operations use `requestAnimationFrame` for smooth rendering.
- No heavy JavaScript frameworks on the drawing canvas -- use vanilla Canvas API or a lightweight library.

### 11.5 Offline Behavior

- If the player loses internet briefly during a drawing round, the drawing canvas continues to work locally. The submission is queued and sent when the connection is restored.
- If the connection is not restored before the timer expires, the auto-submission rules apply based on whatever was last synced or the server's default.

---

## 12. Infrastructure and Deployment

### 12.1 Architecture

```
Client (Browser)
    |
    |-- HTTPS (REST API) --> Azure App Service (Node.js)
    |-- WSS (WebSocket)  --> Azure App Service (Node.js)
                                  |
                                  +--> In-memory game state
```

### 12.2 Technology Stack

| Component | Technology | Rationale |
|---|---|---|
| Frontend | HTML/CSS/JS (vanilla or lightweight framework like Preact/Svelte) | Small bundle, fast load |
| Backend | Node.js with `ws` or `Socket.IO` | Excellent WebSocket support, low overhead |
| Hosting | Azure App Service (Free or B1 tier) | Cheap, supports WebSockets |
| State storage | In-memory (server process) | No database cost; games are ephemeral |
| Static assets | Served from the same App Service or Azure Blob Storage with CDN | Low latency |
| Drawing export | Server-side: none. Client-side canvas export to PNG | Keeps server simple |

### 12.3 Cost Optimization

- **No database**: All game state lives in server memory and is discarded after the game ends (plus a 10-minute buffer for result downloads).
- **Single instance**: At the target scale (a few concurrent games, 20 players max each), a single B1 App Service instance ($13/month) or even the Free tier is sufficient.
- **Minimal bandwidth**: Drawing PNGs are 50--150KB each. A full game with 8 players generates roughly 56 images (7 rounds x 8 players), totaling ~5--8 MB per game. This is negligible bandwidth.
- **No CDN required for v1**: At low scale, serving static assets from the App Service directly is fine.
- **Auto-shutdown**: If using a development/hobby deployment, the App Service can be set to shut down during off-hours to save cost. However, note that in-memory state is lost on restart.

### 12.4 Scaling Notes (Future)

- If scaling beyond a single server instance is needed, game state would need to move to Redis (Azure Cache for Redis) and WebSocket connections would need sticky sessions or a pub/sub adapter (e.g., Socket.IO with Redis adapter).
- This is out of scope for v1 but the architecture should not preclude it. Keep game state access behind a simple interface that could be swapped from in-memory to Redis later.

---

## 13. Data Model Summary

### 13.1 Game

```
Game {
  id: string (UUID)
  code: string (4 letters, e.g., "FROG")
  state: enum (LOBBY, PROMPT, DRAWING, GUESSING, REVIEW, ENDED)
  hostPlayerId: string
  settings: {
    drawingTimerSeconds: number
    guessingTimerSeconds: number
    promptTimerSeconds: number
    useAllRounds: boolean
    customRoundCount: number | null
  }
  players: Player[]
  chains: Chain[]
  currentRound: number
  roundStartedAt: timestamp
  createdAt: timestamp
}
```

### 13.2 Player

```
Player {
  id: string (UUID)
  displayName: string
  isHost: boolean
  isConnected: boolean
  reconnectionToken: string
  joinOrder: number
}
```

### 13.3 Chain

```
Chain {
  originPlayerIndex: number  // the player who wrote the initial prompt
  entries: ChainEntry[]
}
```

### 13.4 ChainEntry

```
ChainEntry {
  type: enum (PROMPT, DRAWING, GUESS)
  playerId: string
  content: string  // text for PROMPT/GUESS, base64 PNG for DRAWING
  submittedAt: timestamp
  wasAutoSubmitted: boolean
}
```

---

## 14. Non-Functional Requirements

### 14.1 Performance

| Metric | Target |
|---|---|
| Page load (initial) | Under 3 seconds on 4G |
| Time to interactive | Under 2 seconds on 4G |
| WebSocket message latency | Under 200ms (server processing) |
| Drawing frame rate | 60fps on mid-range devices |
| Round transition time | Under 1 second |

### 14.2 Reliability

- The server should handle ungraceful client disconnections without crashing.
- All WebSocket message handlers should be wrapped in try/catch to prevent one bad message from affecting other players.
- Game state should be internally consistent at all times. Use a state machine pattern to prevent invalid state transitions.

### 14.3 Security

- Game codes are not sequential and cannot be easily guessed (random selection from 234K+ possibilities).
- Player input (prompts, guesses) should be sanitized before display to prevent XSS.
- Drawing data should be validated (valid base64, reasonable size limit of 500KB per image) to prevent abuse.
- Rate limiting on game creation: max 5 games per IP per hour.
- Rate limiting on join attempts: max 20 attempts per IP per minute.
- No personal data is collected or stored beyond display names, which are discarded when the game ends.

### 14.4 Accessibility

- Text contrast ratios meet WCAG AA standards.
- Interactive elements are focusable and operable via keyboard on desktop.
- Drawing tool buttons have ARIA labels.
- Timer announcements are available via ARIA live regions for screen reader users.
- Note: The drawing mechanic is inherently visual and not fully accessible to visually impaired users. The guessing mechanic is text-based and accessible.

### 14.5 Browser Support

| Browser | Minimum Version |
|---|---|
| Chrome (Android/Desktop) | 90+ |
| Safari (iOS/macOS) | 14+ |
| Firefox (Desktop) | 90+ |
| Edge (Desktop) | 90+ |
| Samsung Internet | 15+ |

WebSocket and Canvas API support is the primary driver for these minimums.

---

## 15. Out of Scope for v1

The following features are intentionally excluded from the first version to keep scope manageable and costs low:

- **User accounts and authentication**: No login, no persistent profiles.
- **Custom word lists**: Players write their own prompts; no curated category packs.
- **Voting/scoring**: No "best drawing" or "funniest chain" voting. The game is for laughs, not competition.
- **Chat/reactions**: No in-game text chat or emoji reactions during gameplay. Players are assumed to be in the same room or on a voice call.
- **Spectator mode**: No view-only mode for non-players.
- **Replay/history**: No ability to view past games. Results are available for 10 minutes post-game only.
- **Custom avatars**: Players are identified by display name only.
- **Sound effects/music**: No audio. Keeps the app lightweight and avoids annoyance in group settings.
- **Fill tool / shapes**: The drawing tool is freehand only. No fill bucket, no shape tools, no text-on-canvas tool.
- **Profanity filter**: No automated content moderation. This is a game played among friends.
- **Multi-language support**: English-only UI for v1.
- **PWA/offline mode**: The app requires an active internet connection at all times.
- **Native mobile app**: Web-only. No iOS or Android app store presence.

---

*End of specification.*
