# Dittle — Rules

Dittle is a two-player abstract strategy game played on a **7×7 board**. Each player
has **7 dice** and races them across the board toward the opponent's side. After the
opening roll to decide who moves first, there is **no luck** — every outcome is decided
by the players' moves.

This game ships with **two variants**. They share the same board, the same setup, and
the same core movement, but they differ in **how you win** and in **whether dice can be
captured**:

| | **Traditional Dittle** (Dice Battle) | **Dittle Clash** |
|---|---|---|
| Goal | Get **all 7** of your dice into the opponent's base row, then win on **score** (sum of up-faces) | Get **any one** die into the opponent's base row |
| Jumping | **Allowed** (leap over dice) | **Not allowed** (tilts only) |
| Capturing / elimination | **None** — dice never remove each other | **Yes** — direct clashes and surrounds remove dice |
| Feel | Longer, positional, race + arithmetic | Shorter, aggressive, combat |

Source of truth: the official rules at
<https://officialgamerules.org/game-rules/dittle-dice-battle-rules/>. Where the official
rules leave something undefined (noted below), this implementation's house rule is
called out explicitly.

---

## Shared rules (both variants)

These apply to **both** Traditional Dittle and Dittle Clash unless a variant section
says otherwise.

### Components & board

- A **7×7** board. Each player owns the **base row** closest to them (row of 7 squares
  on their side). Your opponent's base row is the row you are racing toward — your
  **goal row**.
- Each player has **7 dice** (one player black, one white).

### Setup

- Each player places their 7 dice on their own base row, one per square.
- **Every die starts with 6 facing up and 3 facing toward its owner.** Both players set
  up identically.

### Who goes first

- Each player rolls two dice; the higher total goes first (re-roll ties). This is the
  only die roll in the game. Turns then strictly alternate.
- In this implementation, **Player 0** (bottom of the board) always moves first against
  the computer; the online opening is fixed rather than rolled.

### A die's faces

- A die is described by which number is **up**, which is **north**, and which is **east**.
  Opposite faces always sum to 7 (so down = 7−up, south = 7−north, west = 7−east).
- The **up-face only changes when a die tilts** (rolls) onto a new square. Jumping does
  **not** change a die's up-face. You may **never** spin/rotate a die in place — a die
  must physically move to a new square for its number to change.

### Direction rules (both tilts and jumps)

- Movement is **forward** (toward the opponent) or **sideways** (left/right).
- **Never backward.** Never diagonally.

### Move types

On your turn you move **one** die using exactly one of the moves allowed in your variant:

- **Tilt forward** — roll a die one square forward. Its up-face changes.
- **Tilt sideways** — roll a die one square left or right. Its up-face changes.
- **Jump** (Traditional only, see below) — leap over one or more dice.
- **Tilt + jump** (Traditional only) — tilt once, then jump.

### Advancing inside the opponent's base row

Reaching the opponent's base row does **not** freeze a die. You may keep **tilting it
sideways** (or forward, where a square exists) within that row to change its up-face.
This matters most in Traditional, where a die that arrives showing a 2 can be tilted up
to a higher number before the game ends.

### If a player has no legal move

The official rules do not define this. **House rule (this implementation):** if the
player to move has no legal move, the game ends immediately.
- In **Clash**, the stuck player **loses** (consistent with the game's elimination
  spirit).
- In **Traditional**, the game is **adjudicated by position** (see "Stalemate & move
  limit" below) rather than being an automatic loss.

### Move limit

To guarantee games terminate, a hard ply cap applies. If it is reached with no natural
winner, the game is **adjudicated by position** (advancement of each side's dice, then
up-face strength). This is a safety net against endless over-cautious play, not part of
the official rules.

---

## Variant 1 — Traditional Dittle (Dice Battle)

> **One-line summary:** race **all seven** of your dice into the opponent's base row.
> The game ends the moment either player has all seven across, and the winner is
> whoever's dice in the base row show the **higher total** of up-faces. **No die is ever
> captured.**

### Movement (Traditional)

All of the following are legal. A jump lands on the **empty** square just beyond a
jumped die; you may jump over **your own or the opponent's** dice.

1. **Tilt forward** — onto an **empty** square only. (A tilt may **not** land on any
   occupied square — there is no capturing in Traditional.)
2. **Tilt sideways** — onto an **empty** square only.
3. **Jump (vertical)** — leap forward over one or more dice in a **straight** line,
   landing on the empty square past each jumped die. May chain over several dice as long
   as there is a gap between them; the chain stays in a straight line and does **not**
   turn.
4. **Jump (horizontal)** — same, but sideways in a straight line.
5. **Tilt + jump (vertical / horizontal / mixed "L-shape")** — tilt once onto an
   **empty** square, then jump over one or more dice. The jump portion **may turn**
   (e.g. jump forward, then sideways), which is how "L-shaped" moves are formed. The
   up-face changes **only** from the tilt, never from the jump portion.

> **Jump chaining rule:** when jumping several dice in one move, there must be at least
> one empty square between each jumped die — you cannot leap a tight cluster with no
> gaps. Each hop lands on the empty square immediately beyond the die it jumps.
>
> **Turning:** a **pure** jump (no preceding tilt) travels in a single straight line and
> does not turn. Only a **tilt + jump** may turn (the "mixed / L-shape" move). *(This
> follows the official move list, which offers "jump vertical" and "jump horizontal"
> for pure jumps but reserves the "mixed / L-shape" jump for the tilt + jump case.)*

### No capturing

Dice in Traditional **never remove each other**. Jumps always land on empty squares and
never capture the jumped die. Tilts may not land on an occupied square. Both players
therefore always keep all 7 dice for the whole game.

### How to win (Traditional)

- **The game ends the moment one player has all 7 of their dice in the opponent's base
  row.**
- At that moment, **each player adds up the up-faces of their own dice sitting in the
  opponent's base row.** The player with the **higher total wins.** (An equal total is a
  **draw** in this implementation.)
- **Filling first does not guarantee the win.** A player who rushed across showing low
  numbers can lose to an opponent who arrived (with fewer or the same dice) showing high
  numbers. Because only up-faces in the base row are scored, and because you can keep
  tilting a die up once it arrives, arrival **numbers** matter as much as arrival
  **speed**.

> **Strategic consequence:** you generally do **not** want to move your seventh die
> across unless your base-row total is at least as high as your opponent's — doing so
> ends the game and could hand them the win.

### Stalemate & move limit (Traditional)

If the player to move has no legal move, or the move limit is reached, the game is
**adjudicated by position**: the side whose dice are collectively further advanced (and,
as a tiebreaker, showing higher up-faces) is declared the winner; an exact tie is a
draw.

---

## Variant 2 — Dittle Clash (faster variant)

> **One-line summary:** get **one** die into the opponent's base row and you win
> immediately — but there is **no jumping**, and dice **clash and eliminate** each other,
> so getting there is a fight.

Dittle Clash follows all the shared rules above, **with these differences.**

### Movement (Clash)

- **Only two moves are legal: Tilt forward and Tilt sideways.**
- **No jumping of any kind** (no jump, no tilt + jump).
- A tilt moves one square forward or sideways (never backward/diagonal), and its up-face
  changes as it rolls.
- You may not tilt onto **your own** die. You **may** tilt onto an **opponent's** die —
  this triggers a **clash** (see below).

### Clashing — dice eliminate each other

- **Direct clash:** if your die tilts onto a square occupied by an **opponent's** die,
  compare up-faces. The die showing the **lower** number is **removed** from the board.
  The winner occupies the square.
- **Surround clash:** if a die is orthogonally **adjacent to two or more opponent dice**,
  compare that die's up-face to the **sum** of all the surrounding opponents' up-faces.
  Whichever side is **lower** is eliminated — either the single surrounded die, or **all**
  the surrounding dice.
- **Ties eliminate everyone involved:** a direct clash of equal up-faces removes **both**
  dice; a surrounded die whose up-face equals the surrounders' sum removes the die **and**
  all surrounders.
- Surround clashes are re-checked and resolved **repeatedly** after every move until the
  board is stable (a removal can create a new surround).

### How to win (Clash)

- **The moment any one of your dice reaches the opponent's base row, you win** — you do
  **not** need to fill the row. First die across wins.
- You also win if your opponent has **no dice left** (elimination) or the opponent has
  **no legal move** on their turn.
- Because turns alternate, only one player can cross on a given turn; there is no
  simultaneous-arrival tie.

### Strategy note (Clash)

Getting eliminated is a serious setback. Only move a die into a clash when yours shows
the **higher** number, and protect a strong die to make the crossing run.

---

## Quick comparison of win conditions

| Situation | Traditional | Clash |
|---|---|---|
| One of your dice reaches the goal row | Nothing special — keep going | **You win immediately** |
| All 7 of your dice reach the goal row | **Game ends; higher base-row up-face total wins** | (N/A — already won on the first die) |
| Opponent has no dice left | Cannot happen (no capturing) | **You win** (elimination) |
| Opponent has no legal move | Game adjudicated by position | **You win** (opponent stuck) |
| Move limit reached | Adjudicated by position | Adjudicated by position |

## Implementation notes

- The rules engine (`shared/engine.js`) is variant-aware: `initialState(variant)` stores
  the variant (`'traditional'` or `'clash'`) in the game state, and move generation,
  clash resolution, and win detection all branch on it.
- The AI (`shared/ai.js`) uses a **separate evaluation and separate learned weights per
  variant**, because the two variants reward completely different play (all-dice-across
  with high faces vs. a single aggressive breakthrough). See `ai/weights.json`.
- You choose the variant when creating a game (vs. computer or an online room).
