# Expert AI Improvement Plan

**Date:** 2026-04-13
**Status:** Proposal

## Problem Statement

The Expert AI makes dangerous, low-ROI moves and misses obvious strong plays. It has never beaten a competent human player. Specific weaknesses:

- Bearing off is very weak until the bearoff database activates (all checkers in home board, no contact)
- Once the game becomes a race, the AI doesn't shift strategy to leverage race-oriented evaluation
- The AI makes individually plausible but collectively terrible move combinations within a single turn

## Root Cause Analysis

### 1. Greedy Move-by-Move Selection (the #1 problem)

The bot selects moves **one at a time**. With dice 6-3, it picks the single best move from `get_valid_moves()`, applies it, then picks the next best single move from the remaining options. This misses **move synergies** entirely.

Example: With a 6-3 roll, the best *turn* might be to make the 5-point (move 11->5 and 8->5), but greedily the 6 might go somewhere else first, and then the 3 can't complete the point. GNU Backgammon and every serious bot evaluate **complete turns** (all moves for a roll as a unit).

**Relevant code:** `bot_service.py:_select_bot_move()` picks one move at a time. `bot_service.py:execute_bot_turn()` loops calling `_select_bot_move()` until no valid moves remain. Neither considers the full turn as a unit.

### 2. Tiny, Undertrained Neural Network

- V1: 22,805 parameters (198->80->80->5), V2: ~52K parameters (213->160->160->5)
- Trained on 50K random self-play games + 5K TD games
- By comparison: TD-Gammon used 1.5M self-play games. GNU Backgammon uses multiple specialized nets with 100s of hidden units trained over millions of games
- The network doesn't have enough capacity or training data to learn subtle positional concepts

**Relevant files:** `ml/model.py` (BackgammonNet, BackgammonNetV2), `ml/train_fast.py`, `ml/train_fast_v2.py`

### 3. No Game Phase Awareness in Decision Routing

The same neural net handles openings, back games, priming battles, races, and bearoff. These require fundamentally different strategies. The V2 code has infrastructure for contact/race split networks (`train_fast_v2.py` has `is_contact_position()`), but it ships a single unified model.

**Relevant code:** `ml/train_fast_v2.py:is_contact_position()` exists but is only used for training data labeling, not runtime routing.

### 4. Bearoff DB Only Activates at the Very End

The bearoff DB (`ml/bearoff.py`, `ml/models/bearoff.npz`) kicks in only when ALL checkers are in the home board with no contact (`bot_service.py:_is_no_contact_bearoff()`). But race-oriented play should begin much earlier -- once the position is clearly a race (no contact, both sides running), pip-count-aware evaluation should dominate over the neural net.

**Relevant code:** `bot_service.py:_is_no_contact_bearoff()`, `ml/bearoff.py:BearoffDB.is_bearoff_position()`

## Recommendations

### Tier 1: High Impact, Moderate Effort

#### A. Full-Turn Evaluation Instead of Greedy

Instead of picking moves one at a time, enumerate all legal **complete turns** for a dice roll and evaluate the final position of each.

```
For each possible complete sequence of moves with this roll:
    Apply all moves -> evaluate resulting position -> restore
Pick the sequence with the highest equity
```

Backgammon has a branching factor of ~20-30 complete turns per roll (not thousands), so this is very tractable. The engine already has `_snapshot_internals`/`_restore_internals`. This alone would fix many of the "obviously bad" moves you're seeing -- moves that look locally fine but leave the overall position worse.

**Implementation approach:**
- Add a method to game_engine.py that enumerates all complete move sequences for a given dice roll
- In bot_service.py, evaluate each complete turn's final position instead of individual moves
- The bot then plays out the chosen sequence move-by-move (for animation/UX)

#### B. Game Phase Classifier -> Strategy Router

Build a simple, deterministic phase classifier:

```
Phase 1: OPENING (first 3-4 moves of the game)
Phase 2: CONTACT (checkers interleaved, hitting/priming matters)
    Sub-phases: BLITZ (attack opponent's blots aggressively)
                PRIME (build consecutive blocking points)
                BACK GAME (behind in race, hold anchors, wait for shots)
Phase 3: RACE (no contact -- pure pip count competition)
Phase 4: BEAROFF (all checkers in home board)
```

The classifier doesn't need ML -- it's simple heuristics:
- **Contact**: Does either side have checkers behind the other's? Anyone on the bar?
- **Race**: No contact, both sides' back checker has passed the opponent's back checker
- **Bearoff**: All checkers in home board (already have `_is_no_contact_bearoff()`)
- **Back game**: In contact, significantly behind in pip count, holding 2+ anchors in opponent's home

Then route to different evaluation strategies per phase:
- **Contact**: Neural net (this is where it's most useful) + tactical heuristic overlay
- **Race**: Pip count differential + wastage calculation (no neural net needed -- pure math)
- **Bearoff**: Bearoff DB (already have this, just use it earlier)
- **Opening**: Opening book lookup

#### C. Expand Bearoff/Race Evaluation Window

Right now the bearoff heuristic only activates in `_is_no_contact_bearoff()` -- when all checkers are home and no contact. But race evaluation should activate **much earlier**:

- Once there's no contact, switch to a **pip count + wastage** evaluator. This is a well-known formula:
  - **Raw pip count difference** between the two sides
  - **Wastage penalty**: checkers far from the 1-2-3 points waste pips when bearing off. Gaps on low points = bad.
  - **Crossover count**: how many checkers still need to cross into the home board
  - **Distribution smoothness**: evenly distributed checkers bear off faster than stacked ones

This is deterministic math, no neural net needed, and will be much more accurate than the neural net for pure race positions.

#### D. 1-Ply Lookahead for Top Candidates

After scoring all complete turns via the neural net, take the top 3-5 candidates and do a **1-ply rollout**: for each candidate, average the resulting equity over all 21 possible opponent dice rolls (weighting doubles appropriately). This is what GNU Backgammon does at its "World Class" setting.

There are only 21 distinct dice outcomes. For each, you'd evaluate the opponent's best response. So it's roughly: 5 candidates x 21 rolls x 30 opponent moves = ~3,150 neural net evaluations. At CPU speed with a small net, this takes well under a second.

### Tier 2: High Impact, Higher Effort

#### E. Much More Training (and Larger Network)

The current training is orders of magnitude below what's needed for strong play:

- **Scale the network**: At minimum 256->128->128 hidden layers (~100K+ params). The current 80-unit layers can't represent the complexity of backgammon positions.
- **Train for 500K-1M self-play TD games**, not 5K. The original TD-Gammon needed 300K games to reach intermediate level and 1.5M for expert level.
- **Use the trained model to generate training data** iteratively: train -> play 100K games -> train on those -> repeat. This bootstrapping is how TD-Gammon actually worked.

#### F. Opening Book

The first 2-3 rolls of backgammon have well-known optimal plays (established by decades of computer analysis). Hard-code them. There are only ~15 opening roll responses and ~200 second-roll responses. This eliminates early-game blunders entirely.

References like Trice's "Backgammon Boot Camp" or the XG/GNU Backgammon opening databases provide these.

#### G. Tactical Heuristic Overlay

For certain patterns the neural net consistently misses, add explicit heuristic bonuses/penalties to the equity evaluation:

| Pattern | Adjustment |
|---------|------------|
| Leaving a blot within direct shot (6 pips) of opponent checker | Penalty proportional to hit probability |
| Making the opponent's 5-point or 4-point anchor | Large bonus |
| Building a 4+ prime in front of opponent's back checkers | Large bonus |
| Stacking 5+ checkers on a single point | Penalty (wasted checkers) |
| Splitting back checkers early when opponent has strong home board | Penalty |
| Hitting in your own home board | Bonus (opponent enters against your points) |

These can be additive adjustments to the neural net equity, e.g., `final_equity = nn_equity + 0.05 * heuristic_adjustment`.

### Tier 3: Nice to Have

#### H. Doubling Cube Intelligence

The current doubling logic is simplistic (offer at equity > 0.5, accept at equity > -0.5). Real doubling decisions depend on:
- Match score (Crawford rule, etc.)
- Gammon threat
- Volatility of the position
- Whether it's a race or contact position

A separate small network or lookup table for doubling decisions would help.

#### I. Endgame Databases Beyond Pure Bearoff

Extend the bearoff database concept to **contact bearoff** positions (opponent still has 1-2 checkers that could hit). These positions have exact solutions too and are where games are often decided.

#### J. Monte Carlo Rollouts as a Fallback

For positions where the neural net is uncertain (equity close to 0), do a short Monte Carlo simulation: play out 50-100 random games from each candidate position and use the win rate as the evaluation. This is expensive but very accurate for close decisions.

## Suggested Implementation Order

| Priority | Item | Expected Impact | Effort |
|----------|------|-----------------|--------|
| 1 | Full-turn evaluation (A) | Fixes most visible blunders | Medium |
| 2 | Game phase classifier + race evaluator (B + C) | Fixes race/bearoff weakness | Medium |
| 3 | Opening book (F) | Eliminates early-game mistakes | Low |
| 4 | 1-ply lookahead (D) | Major strength jump | Medium |
| 5 | Tactical heuristic overlay (G) | Fixes specific blind spots | Medium |
| 6 | More training + larger network (E) | Overall strength | High |
| 7 | Doubling cube (H) | Better cube decisions | Medium |
| 8 | Contact bearoff DB (I) | Endgame accuracy | High |
| 9 | Monte Carlo rollouts (J) | Close-position accuracy | Medium |

## Current Architecture Reference

```
bot_service.py:_select_bot_move()    # Entry point for move selection
bot_service.py:execute_bot_turn()    # Full turn loop (roll -> move -> end)
bot_integration.py:MLBotPlayer       # V1 neural net (198 features, 80 hidden)
bot_integration.py:MLBotPlayerV2     # V2 neural net (213 features, 160 hidden) + bearoff DB
ml/encoder.py:encode_state()         # 198-feature Tesauro encoding
ml/encoder.py:encode_state_v2()      # 213-feature encoding (adds strategic features)
ml/model.py:BackgammonNet            # V1: 198->80->80->5, sigmoid
ml/model.py:BackgammonNetV2          # V2: 213->160->160->5, ReLU+sigmoid
ml/bearoff.py:BearoffDB              # Perfect endgame DB (15,504 positions)
ml/move_validator.py                 # Expert heuristic scoring (not used in production)
game_engine.py                       # Pure Python rules engine (~1200 lines)
```
