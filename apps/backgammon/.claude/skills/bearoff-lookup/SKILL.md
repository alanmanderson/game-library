---
name: bearoff-lookup
description: Look up the optimal bearing-off move from the endgame database given a board position (or screenshot) and dice roll.
argument-hint: <dice roll, e.g. "4-2"> [position description or screenshot path]
allowed-tools:
  - Bash
  - Read
  - Glob
---

# Bearoff Database Lookup

Look up the optimal bearing-off play from the precomputed endgame database (54,264 positions). Accepts a position described as text, parsed from a screenshot, or set up interactively.

## Input

The user provides:
1. **Dice roll** (required) — e.g. `4-2`, `[3,3]`, `double 5s`
2. **Position** (one of):
   - A **screenshot** of the board (read the image file to extract checker positions)
   - A **text description** like `Black: pt19(5) pt20(1) pt21(1); White: pt1(4)`
   - A **position tuple** like `black=(0,0,0,1,1,5) white=(4,0,0,0,0,0)`

## Reading a screenshot

When given a screenshot, use the `Read` tool to view the image. Then read the board:

- **Top half**: points 13-24 (left to right). Black's home board is the right side (19-24).
- **Bottom half**: points 12-1 (left to right). White's home board is the right side (6-1).
- **Dark checkers** = Black. **Light checkers** = White.
- Count checkers on each point carefully. Each player has 15 total (board + bar + off).
- The borne-off pile is on the right rail. The number shown near the rail may be the doubling cube, not a count.
- Verify: checkers_on_board + off = 15 for each player.

## Prerequisites

This skill only works for **pure bearoff positions** where ALL checkers for both players are in their home boards (White: points 1-6, Black: points 19-24) with no checkers on the bar.

If the position is not a pure bearoff, say so and explain why.

## Running the lookup

Once you have the position and dice, run this script. Substitute the actual position values.

The DB key format is `(closest_to_off, ..., farthest_from_off)`:
- **White**: `(pt1, pt2, pt3, pt4, pt5, pt6)` — natural order
- **Black**: `(pt24, pt23, pt22, pt21, pt20, pt19)` — reversed from board order

For the opponent key, apply the same rule based on *their* color.

```bash
JWT_SECRET=test python3 -c "
import sys
sys.path.insert(0, '/app/backend')
sys.path.insert(0, '/app/ml')
from bearoff import BearoffDB

db = BearoffDB()
db.load('/app/ml/models/bearoff.npz')

# === SUBSTITUTE THESE VALUES ===
# Format: (closest_to_off, ..., farthest_from_off)
# For the player to move:
own_pos = (0, 0, 0, 1, 1, 5)   # e.g. Black: pt24=0 pt23=0 pt22=0 pt21=1 pt20=1 pt19=5
# For the opponent:
opp_pos = (4, 0, 0, 0, 0, 0)   # e.g. White: pt1=4 pt2=0 pt3=0 pt4=0 pt5=0 pt6=0
# Dice:
dice = [2, 4]                    # e.g. rolled 2 and 4
# Who is moving:
mover = 'black'                  # 'white' or 'black'
# ================================

if dice[0] == dice[1]:
    dice = dice * 2  # doubles = 4 dice

print(f'Position: own={own_pos} opp={opp_pos}')
print(f'Dice: {dice}')
print(f'Current equity: {db.lookup(own_pos, opp_pos):.4f}')
print(f'Expected rolls - Mover: {db._expected_rolls.get(own_pos, \"?\"):.3f}, '
      f'Opponent: {db._expected_rolls.get(opp_pos, \"?\"):.3f}')
print()

# Map DB point index to real board point
def db_to_real(db_idx, color):
    if color == 'white':
        return db_idx + 1       # DB 0 = pt1, DB 5 = pt6
    else:
        return 24 - db_idx      # DB 0 = pt24, DB 5 = pt19

results = {}

def try_plays(pos, remaining_dice, desc=''):
    if not remaining_dice:
        key = pos
        off = sum(own_pos) - sum(pos)
        if key not in results:
            eq = db.lookup(pos, opp_pos)
            exp = db._expected_rolls.get(pos)
            results[key] = (eq, exp, off, desc.strip())
        return

    die = remaining_dice[0]
    rest = remaining_dice[1:]
    b = list(pos)
    total = sum(b)

    if total == 0:
        key = pos
        off = sum(own_pos)
        results[key] = (db.lookup(pos, opp_pos), 0.0, off, desc.strip() + ' (all off)')
        return

    found_move = False

    # 1. Exact bear off from point = die
    if die <= 6 and b[die - 1] > 0:
        found_move = True
        new_b = list(b); new_b[die - 1] -= 1
        rp = db_to_real(die - 1, mover)
        try_plays(tuple(new_b), rest, desc + f' {rp}/off({die})')

    # 2. Overshoot bear off (no checker on exact point, none farther)
    if die <= 6 and b[die - 1] == 0:
        has_farther = any(b[j] > 0 for j in range(die, 6))
        if not has_farther:
            for j in range(die - 2, -1, -1):
                if b[j] > 0:
                    found_move = True
                    new_b = list(b); new_b[j] -= 1
                    rp = db_to_real(j, mover)
                    try_plays(tuple(new_b), rest, desc + f' {rp}/off({die}ovr)')
                    break

    # 3. Move within home board
    for j in range(5, -1, -1):
        if b[j] > 0:
            target = (j + 1) - die
            if target >= 1:
                found_move = True
                new_b = list(b); new_b[j] -= 1; new_b[target - 1] += 1
                rf = db_to_real(j, mover)
                rt = db_to_real(target - 1, mover)
                try_plays(tuple(new_b), rest, desc + f' {rf}/{rt}({die})')

    if not found_move:
        # This die can't be used, skip it
        try_plays(pos, rest, desc + f' (die {die} unused)')

# Try both orderings for non-doubles
seen_orders = set()
from itertools import permutations
for perm in permutations(dice):
    if perm not in seen_orders:
        seen_orders.add(perm)
        try_plays(own_pos, list(perm))

ranked = sorted(results.items(), key=lambda x: -(x[1][0] or -999))

print(f'All possible plays ({len(ranked)}):')
print()
for i, (pos, (eq, exp, off, desc)) in enumerate(ranked):
    tag = ' <<<< BEST' if i == 0 else ''
    print(f'  {i+1}. {desc}')
    print(f'     Result: {pos}  bore off {off}  rolls left: {exp:.3f}  equity: {eq:+.4f}{tag}')
    print()
"
```

## Reporting results

Present the results as a table sorted best-to-worst. Highlight the optimal play. Include:
- The move sequence in standard notation (e.g. `21/off 19/21`)
- How many checkers are borne off
- Expected rolls remaining
- Equity

If the optimal play is close to alternatives (equity difference < 0.01), note that the plays are nearly equivalent.

At the end, state the **recommended play** clearly in one sentence.
