# Lemonade Stand Tycoon — Product Requirements Document (PRD)

**Version:** 1.0
**Date:** 2026-04-03
**Product Manager:** (Product Team)
**Status:** APPROVED — MVP Development

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [MVP Feature Set](#2-mvp-feature-set)
3. [User Stories (MVP)](#3-user-stories-mvp)
4. [V2 Features (Post-Launch)](#4-v2-features-post-launch)
5. [Key Metrics to Track](#5-key-metrics-to-track)
6. [Priority Matrix](#6-priority-matrix)
7. [Game Flow](#7-game-flow)
8. [Appendix: Progression Stage Definitions](#8-appendix-progression-stage-definitions)

---

## 1. Executive Summary

### Product Vision

Lemonade Stand Tycoon is a browser-based tycoon/idle game in which players begin with $50, a folding table, and a pitcher of lemonade — and methodically build a global beverage empire across 10 progression stages. The game targets the casual-to-mid-core strategy audience who enjoys economic simulation, incremental progression, and meaningful resource management decisions.

### Target Audience

- **Primary:** Ages 16–35, casual gamers who enjoy idle/tycoon games (Cookie Clicker, AdVenture Capitalist, Game Dev Tycoon)
- **Secondary:** Ages 12–15 students interested in entrepreneurship/business concepts
- **Platform:** Browser-first (desktop + mobile responsive)

### MVP Goal

Deliver a complete, fun, and replayable first experience covering the first 3 of 10 progression stages. The MVP must demonstrate the full game loop, provide meaningful decisions, and establish the emotional hook that drives session length and D7/D30 retention.

### Success Criteria (MVP Launch)

| Metric | Target |
|---|---|
| D1 Retention | >= 45% |
| D7 Retention | >= 20% |
| Avg. Session Length | >= 8 minutes |
| % Reaching Stage 2 | >= 60% |
| % Reaching Stage 3 | >= 30% |
| Avg. Sessions per DAU | >= 2.5 |

---

## 2. MVP Feature Set

### 2.1 Core Game Loop

The fundamental loop that every session revolves around. Each iteration represents one in-game "day."

```
BUY SUPPLIES
    |
    v
SET RECIPE  <--------------------------------------------+
    |                                                    |
    v                                                    |
SET PRICE                                                |
    |                                                    |
    v                                                    |
SIMULATE DAY  (weather revealed, customers arrive)      |
    |                                                    |
    v                                                    |
VIEW RESULTS  (revenue, profit, ratings, events)        |
    |                                                    |
    v                                                    |
REINVEST / UPGRADE  -------------------------------->---+
```

**Loop constraints:**
- Each loop takes ~60–90 seconds of active play
- Idle/offline progress is calculated server-side so returning players see results of days they missed
- A player can queue up to 3 days of supplies in advance (unlocked at Stage 2)

---

### 2.2 Progression Stages (MVP: Stages 1–3)

#### Stage 1: The Neighborhood Stand

- **Unlock condition:** Game start
- **Assets:** 1 lemonade stand, residential neighborhood location
- **Starting cash:** $50
- **Capacity:** Up to 30 customers per day
- **Upgrades available:**
  - Better Pitcher ($15) — reduces prep time, increases consistency
  - Shade Umbrella ($25) — reduces heat weather penalty
  - Sidewalk Chalk Sign ($10) — +10% foot traffic
  - Ice Chest ($30) — enables selling cold lemonade (higher price ceiling)
- **Win condition for Stage 2:** Accumulate $300 total cash, serve 200 customers total

#### Stage 2: Multiple Stands

- **Unlock condition:** Complete Stage 1 win condition
- **Assets:** Up to 3 simultaneous stands, choose from 3 neighborhood zones (residential, park, school)
- **Starting cash:** Carried over
- **Capacity:** Up to 90 customers/day across all stands
- **Upgrades available:**
  - Manager Hire ($75/week) — runs a second stand autonomously
  - Supply Bulk Purchase — 10% discount when buying for 3+ days
  - Brand Colors — cosmetic unlock, increases customer loyalty modifier
  - Basic Inventory Cart — reduces supply waste by 15%
- **Win condition for Stage 3:** Own 3 active stands simultaneously, reach $1,000 total net worth

#### Stage 3: Permits & Legitimacy

- **Unlock condition:** Complete Stage 2 win condition
- **Assets:** City permit system, access to commercial zones (downtown, farmer's market, events)
- **Starting cash:** Carried over
- **Capacity:** Up to 200 customers/day with right permits + locations
- **New mechanic:** Health inspection events, permit renewal costs, competition from rival stands
- **Upgrades available:**
  - Commercial Blender ($150) — unlocks "Specialty Lemonade" recipes
  - Point-of-Sale Tablet ($200) — tracks per-stand analytics
  - Logo Design ($50 one-time) — brand identity, unlocks loyalty punch cards
  - City Event Permit ($100) — access to weekend festivals (3x daily traffic)
- **Win condition for Stage 4 (V2):** $5,000 net worth, hold 3 active permits

---

### 2.3 Weather System

Weather is the primary external variable that forces players to adapt their recipe and pricing strategy each day.

#### Weather States

| Condition | Frequency | Effect |
|---|---|---|
| Sunny & Hot | 25% | +40% customers, customers willing to pay more |
| Sunny & Mild | 30% | Baseline |
| Cloudy | 20% | -15% customers |
| Rainy | 15% | -50% customers, prep waste increases |
| Very Hot (Heat Wave) | 5% | +70% customers, but supply costs +20% |
| Cold Snap | 5% | -60% customers |

#### Weather Forecast System

- Players see tomorrow's forecast at the end of each day (80% accuracy)
- A "Weather App Upgrade" ($40) can be purchased for 95% accuracy
- Weather is seeded per game so hardcore players cannot reload-scum

#### Weather + Recipe Interaction

- Cold days: Hot lemonade variant sells better (unlocked at Stage 1 after Ice Chest)
- Very hot days: Ice-cold lemonade premium increases up to +$0.50/cup
- Rainy days: Supply runs waste 1–2 extra lemons per batch (simulates real waste)

---

### 2.4 Basic Customer Simulation

Customers are simulated agents that evaluate purchase decisions each day based on a weighted formula.

#### Customer Decision Model

```
Purchase Probability = BaseTraffic
  x WeatherMultiplier
  x PriceElasticityFactor
  x RecipeQualityScore
  x LocationPopularityScore
  x LoyaltyBonus (if returning customer)
```

#### Customer Segments (Stage 1–3)

| Segment | % of Traffic | Price Sensitivity | Quality Sensitivity |
|---|---|---|---|
| Kids | 25% | Very High | Low |
| Teenagers | 20% | High | Medium |
| Parents | 30% | Medium | High |
| Office Workers | 15% | Low | High |
| Tourists | 10% | Low | Very High |

- Each segment has a unique willingness-to-pay curve
- "Loyal Customers" tag appears after a segment visits 5+ times, grants +5% repeat visit chance
- Negative reviews spread if price is more than 40% above quality rating ("price gouging" event)

#### Daily Customer Report (End-of-Day)

- Total customers served
- Customers who walked away (price too high or sold out)
- Average happiness rating (1–5 stars)
- Breakdown by segment
- Notable events ("A school group stopped by! +12 kids today")

---

### 2.5 Recipe System

The recipe system is the primary skill expression mechanic. Players balance ingredient ratios to hit the quality sweet spot for the current conditions.

#### Base Ingredients (Stage 1)

| Ingredient | Unit Cost | Effect |
|---|---|---|
| Lemons | $0.25 each | Base flavor, freshness rating |
| Sugar | $0.10/tbsp | Sweetness, affects kid/teen preference |
| Water | Free | Dilution — too much = low quality |
| Ice | $0.05/cup | Coldness rating, required for "cold" variant |

#### Recipe Attributes (displayed visually)

- **Sweetness Meter** (0–100): bar chart, colored green/yellow/red
- **Sourness Meter** (0–100): bar chart
- **Freshness Score** (0–100): derived from lemon quantity + time-to-sell
- **Price-per-Cup** vs. **Recommended Price Range**: shown as a target reticle visual

#### Visual Feedback

- A cartoon customer reaction face updates in real-time as the player adjusts the recipe sliders
- "Too sweet!" / "Perfect balance!" / "Too sour!" tooltip appears on hover
- Recipe "Score" displayed as a 1–5 star rating before the day simulation
- Color-coded ingredient cards: green = optimal, yellow = borderline, red = waste

#### Recipe Presets & Saved Recipes

- Players can save up to 3 named recipe presets (MVP)
- "Quick Recipes" button surfaces the last 3 used recipes
- "Suggested Recipe" AI hint available once per day (uses current weather + segment data)

---

### 2.6 Financial Tracking

Every financial transaction is logged and surfaced through a clear, visual dashboard.

#### Daily P&L Summary

```
DAILY SUMMARY — Day 14

Revenue:          $42.75
Cost of Goods:   -$18.40
  Lemons:          -$11.00
  Sugar:            -$3.20
  Ice:              -$4.20
Gross Profit:     $24.35
Expenses:
  Stand Fee:        -$2.00
Net Profit:       $22.35

Cash Balance:    $187.50
Net Worth:       $312.50  (cash + upgrades)
```

#### Charts & Graphs

- 7-day and 30-day rolling line chart: Revenue, COGS, Net Profit
- Bar chart: Customers per day
- Donut chart: Revenue by customer segment
- "Best Day Ever" vs. current day comparison

#### Financial Milestones

- First $100 earned (achievement trigger)
- First profitable day
- First $500 net worth
- First day with 0 waste (all supply sold)

---

### 2.7 Save / Load Game

#### Save Architecture

- **Server-side save:** Primary game state saved to the player's account (SQLite → Azure SQL)
- **Auto-save:** Triggered after every day simulation completes
- **Manual save:** "Save Now" button always visible in the header
- **Offline progress:** Days elapsed while offline are calculated on next login (capped at 7 days of offline earnings)
- **Save slots:** 2 save slots per account (MVP), allows starting a fresh run

#### Save Data Includes

- All financial history (daily snapshots)
- Upgrade inventory
- Recipe presets
- Achievement progress
- Current stage and win-condition progress
- Random seed for weather reproducibility

#### Local Fallback

- IndexedDB local backup written after every save
- If server save fails, the local backup is used and a sync is queued for next connection
- "Unsaved changes" indicator in the UI header when offline

---

### 2.8 Achievement System (20 MVP Achievements)

Achievements serve dual purpose: onboarding tutorial reinforcement and long-term engagement goals.

#### Achievement List

| # | Name | Description | Category |
|---|---|---|---|
| 1 | Fresh Squeezed | Complete your first day of business | Onboarding |
| 2 | In the Black | End a day with positive net profit | Financial |
| 3 | Century Club | Earn $100 total revenue | Financial |
| 4 | Perfect Pour | Achieve a 5-star recipe rating | Recipe |
| 5 | Rain or Shine | Sell lemonade on a rainy day | Weather |
| 6 | Heat Wave Hero | Earn $50+ on a heat wave day | Weather |
| 7 | No Waste Day | Sell every cup — zero leftover supply | Operations |
| 8 | Loyal Following | Have 10 loyal customers in one day | Customers |
| 9 | Penny Pincher | Run 5 consecutive profitable days | Financial |
| 10 | Upgrade Addict | Purchase your first upgrade | Progression |
| 11 | Multi-Stand Maven | Open your second stand | Progression |
| 12 | Triple Threat | Operate 3 simultaneous stands | Progression |
| 13 | Permit Holder | Obtain your first city permit | Progression |
| 14 | Market Day | Sell at a farmer's market event | Events |
| 15 | Price Tactician | Change your price 3 times in one week based on weather | Strategy |
| 16 | Recipe Hoarder | Save 3 custom recipe presets | Recipe |
| 17 | The Grind | Simulate 30 total days | Longevity |
| 18 | Big Spender | Purchase $500 worth of upgrades total | Progression |
| 19 | Reviewed! | Receive your first 5-star customer rating | Customers |
| 20 | Stage 3 Unlocked | Reach the Permits & Legitimacy stage | Milestone |

#### Achievement Rewards

- Each achievement grants a small cash bonus ($5–$50) or a cosmetic unlock
- Achievement notifications appear as a toast pop-up with a satisfying animation
- An achievement gallery is accessible from the main menu

---

### 2.9 Basic Competitor AI

Competitors apply pressure that prevents infinite scaling on any single location, driving players to expand.

#### Competitor Behavior (Stage 1–3)

- **Stage 1:** 1 rival stand ("Billy's Lemonade") appears on Day 5 at a random neighborhood location
- **Stage 2:** 2–3 rivals, one may occasionally move to the same zone as the player
- **Stage 3:** Rivals now compete for city event permits (limited slots per event)

#### Competitor Mechanics

- Rivals have their own pricing and recipe quality (visible to the player as a "Spy" action, limited to once/day)
- If a rival is in the same zone:
  - Both stands share available foot traffic
  - A rival with a lower price will capture a % of customers
  - A rival with a higher quality score captures quality-sensitive segments
- "Undercutting" alert: If a rival prices below you by more than $0.25, a notification fires

#### Competitor States

| State | Trigger | Effect |
|---|---|---|
| Growing | 5 profitable days | Rival adds an upgrade |
| Struggling | 3 unprofitable days | Rival lowers price |
| Closed | 7 consecutive unprofitable days | Rival disappears from zone |
| Expanding | Player reaches Stage 2 | New rival spawns in a new zone |

#### Player vs. Competitor Advantage

Players can drive out competitors by sustaining high quality and competitive pricing for 5+ consecutive days in the same zone (the "Dominate a Zone" mechanic). This rewards engaged, active players.

---

## 3. User Stories (MVP)

### 3.1 Core Game Loop

---

**US-001: Execute a Full Day of Business**

> As a player, I want to simulate a complete business day — from buying supplies to seeing results — so that I feel the satisfaction of running my stand and making progress.

**Acceptance Criteria:**
- [ ] The player can access the Supply Shop from the main game screen at any time before day simulation
- [ ] The player can adjust recipe sliders and see real-time quality score updates before simulating
- [ ] The player can set a price per cup (min $0.10, max $5.00) before simulating
- [ ] Clicking "Open for Business" triggers the day simulation (animated sequence, ~5 seconds)
- [ ] An end-of-day results screen is displayed showing: revenue, COGS, net profit, customers served, customers who left, and at least one narrative event
- [ ] Cash balance updates immediately and visibly after results are dismissed
- [ ] The player cannot simulate the same day twice

---

**US-002: Buy Supplies**

> As a player, I want to purchase ingredients before each day so that I can control my cost structure and plan for expected demand.

**Acceptance Criteria:**
- [ ] Supply shop shows: lemons, sugar, ice (Stage 1), and any unlocked ingredients
- [ ] Each item shows: unit price, quantity selector, subtotal, and current cash balance
- [ ] Purchasing is blocked if total cost exceeds current cash balance (button grayed out with tooltip)
- [ ] Leftover supplies from the previous day are shown and factored into today's starting inventory
- [ ] A "Suggested Amount" button pre-fills quantities based on yesterday's demand + weather forecast
- [ ] Purchase confirmation deducts cash immediately and updates the inventory display

---

**US-003: Set Recipe**

> As a player, I want to experiment with ingredient ratios so that I can maximize quality and appeal to different customer preferences.

**Acceptance Criteria:**
- [ ] Recipe screen shows sliders for: lemon quantity per cup, sugar per cup, water per cup, ice per cup
- [ ] A live "Quality Score" (1–5 stars) updates as sliders change
- [ ] A "Sweetness" and "Sourness" visual meter updates in real-time
- [ ] A cartoon customer reaction face reflects current recipe quality
- [ ] A tooltip appears when any attribute is in "poor" range (red zone)
- [ ] Player can save the current recipe as a named preset (up to 3 presets)
- [ ] Player can load any saved preset
- [ ] "Suggest a Recipe" button is available once per day, pre-filling optimal sliders for current conditions

---

**US-004: Set Price**

> As a player, I want to set the price per cup so that I can balance volume vs. margin based on current conditions.

**Acceptance Criteria:**
- [ ] A price input field accepts values from $0.10 to $5.00 (enforced)
- [ ] A "Recommended Range" indicator shows the price band based on recipe quality and current weather
- [ ] Price set above recommended range shows a "High Risk — Customers may leave" warning
- [ ] Price set below recommended range shows a "Low Margin — Consider raising" advisory
- [ ] The UI shows the projected revenue range (low/high estimate) before simulating

---

### 3.2 Weather System

---

**US-005: View Daily Weather**

> As a player, I want to see the weather before and during each day so that I can adapt my recipe and pricing strategy accordingly.

**Acceptance Criteria:**
- [ ] Current day weather is displayed prominently on the main game screen before simulation
- [ ] Weather is shown as an icon + text label (e.g., sun icon + "Sunny & Hot")
- [ ] A weather effect summary is shown ("Customers expect cold drinks today. Consider adding extra ice.")
- [ ] Tomorrow's forecast is shown on the end-of-day results screen with 80% accuracy caveat
- [ ] Weather forecast accuracy improves to 95% if the "Weather App Upgrade" has been purchased
- [ ] All 6 weather states are visually distinct (icons + background color shift on main screen)

---

### 3.3 Customer Simulation

---

**US-006: See Detailed Customer Results**

> As a player, I want to see a breakdown of who bought lemonade and who walked away so that I can understand what's driving or hurting my sales.

**Acceptance Criteria:**
- [ ] End-of-day results show: total customers served, total customers who walked away (with reason: "price too high" or "sold out")
- [ ] Breakdown by customer segment is shown (Kids, Teenagers, Parents, Office Workers, Tourists) as a bar or pie chart
- [ ] Average happiness rating displayed as a star rating (1–5)
- [ ] At least 1 narrative event line appears per day ("A group of office workers stopped in — they loved it!")
- [ ] Loyal customers count is shown ("12 loyal customers visited today")

---

**US-007: Build Customer Loyalty**

> As a player, I want to earn loyal customers over time so that I have a stable revenue base that grows with my reputation.

**Acceptance Criteria:**
- [ ] A customer segment earns "loyal" status after 5+ consecutive visit days
- [ ] Loyal customers are shown as a distinct count on the results screen
- [ ] Loyal customers have a 5% higher purchase probability than new customers
- [ ] A "Loyal Customers" stat is tracked on the player's financial dashboard
- [ ] Loyalty resets if the player closes a stand at a location for 3+ days

---

### 3.4 Recipe System

---

**US-008: Experiment with Recipes and See Visual Feedback**

> As a player, I want clear, visual, real-time feedback on my recipe quality so that I feel confident before simulating a day.

**Acceptance Criteria:**
- [ ] All recipe feedback updates within 100ms of any slider movement (no lag)
- [ ] Quality star rating is the most prominent visual element on the recipe screen
- [ ] Color coding (green/yellow/red) is applied to all attribute bars
- [ ] A "Preview" mode shows estimated daily revenue for the current recipe + price at current weather (shown as a range, not exact)
- [ ] The recipe screen is accessible in under 2 taps/clicks from the main game screen

---

### 3.5 Progression

---

**US-009: Progress to Stage 2**

> As a player, I want to be clearly informed of the requirements to advance to the next stage so that I always know what I am working toward.

**Acceptance Criteria:**
- [ ] A "Stage Progress" panel is permanently visible on the main screen showing: current stage name, progress bars for each win condition, and estimated days to completion at current pace
- [ ] A congratulatory modal fires when all win conditions are met, explaining what the next stage unlocks
- [ ] The modal includes a cinematic title card for the new stage name
- [ ] Transitioning to Stage 2 does not reset cash — it is carried over
- [ ] A tutorial overlay on first Stage 2 access highlights the new mechanics (multiple stands, zones)

---

**US-010: Manage Multiple Stands (Stage 2)**

> As a player, I want to open and manage multiple stands so that I can expand my reach and grow revenue faster.

**Acceptance Criteria:**
- [ ] A "Stands" management screen shows all active and available stand slots (max 3 in Stage 2)
- [ ] Each stand shows: location zone, daily revenue (last 7 days), current recipe assigned, and current manager status
- [ ] Opening a new stand costs $50 (setup fee) and requires selecting a zone
- [ ] Each stand can have its own recipe and price assigned
- [ ] The day simulation runs all stands simultaneously and results are shown per-stand and in aggregate
- [ ] Hiring a Manager ($75/week) automates one stand's daily operations (uses last set recipe and price)

---

**US-011: Obtain City Permits (Stage 3)**

> As a player, I want to apply for city permits so that I can access premium commercial locations with higher foot traffic.

**Acceptance Criteria:**
- [ ] A "Permits" screen lists available permit types with cost, renewal interval, and associated locations
- [ ] Permit application costs cash and takes 1 in-game day to process (pending state)
- [ ] A health inspection event can randomly occur for any permitted stand (1–5% daily chance)
- [ ] Passing a health inspection grants a "Clean Bill of Health" badge (+5% customer trust for 7 days)
- [ ] Failing a health inspection suspends that stand for 1 day and costs a $25 fine
- [ ] City Event permits are limited to 2 per player per week and can be competed for by AI rivals

---

### 3.6 Financial Tracking

---

**US-012: View Financial Dashboard**

> As a player, I want a clear financial dashboard so that I can understand my profitability trends and make informed decisions.

**Acceptance Criteria:**
- [ ] Dashboard is accessible from the main screen via a single tap/click
- [ ] Shows 7-day rolling line chart for Revenue, COGS, and Net Profit
- [ ] Shows all-time totals: total revenue earned, total expenses, total net profit
- [ ] Shows current cash balance and net worth (cash + asset value of upgrades)
- [ ] Shows best single day performance (revenue and date)
- [ ] Data updates after every day simulation

---

### 3.7 Save / Load Game

---

**US-013: Auto-Save and Resume Progress**

> As a player, I want my game to save automatically so that I never lose progress due to browser issues or accidental tab closure.

**Acceptance Criteria:**
- [ ] Auto-save triggers after every day simulation completes (confirmed by API response)
- [ ] A "Saved" indicator with timestamp appears in the header after each auto-save
- [ ] If the player closes and reopens the browser, all state is fully restored from server
- [ ] If the server is unreachable, the local IndexedDB fallback is loaded with a "Playing Offline" banner
- [ ] When back online, the local state syncs to the server within 5 seconds of reconnection

---

**US-014: View Offline Progress**

> As a player, I want to see how my business performed while I was away so that returning to the game is exciting, not punishing.

**Acceptance Criteria:**
- [ ] On login after being away, a modal shows: days elapsed, offline revenue earned (based on last set recipe/price), and any notable events
- [ ] Offline progress is calculated server-side based on the game state at last save
- [ ] Offline earnings are capped at 7 days to prevent excessive catch-up
- [ ] The player can see a day-by-day breakdown of their offline period
- [ ] Offline progress calculation takes no more than 2 seconds on login

---

### 3.8 Achievements

---

**US-015: Earn and View Achievements**

> As a player, I want to earn achievements for reaching milestones so that I feel rewarded for exploring all aspects of the game.

**Acceptance Criteria:**
- [ ] Achievement notifications fire as a toast overlay immediately when the unlock condition is met
- [ ] Toast shows: achievement icon, name, description, and reward amount (if applicable)
- [ ] Achievement gallery lists all 20 achievements with locked/unlocked status
- [ ] Locked achievements show name and icon but hide the description (mystery locked)
- [ ] Earned achievements grant their cash reward directly to the player's balance
- [ ] Achievement gallery is accessible from the main menu within 2 taps/clicks

---

### 3.9 Competitor AI

---

**US-016: Compete Against Rival Stands**

> As a player, I want to face AI competitors so that I have a reason to stay competitive and make smart strategic decisions about location and pricing.

**Acceptance Criteria:**
- [ ] A rival stand spawns on Day 5 at a random location (visible on the location map)
- [ ] The rival's current price is visible on the location map (spy information)
- [ ] A "Spy" action is available once per day to reveal the rival's recipe quality score
- [ ] If a rival is in the same zone, a "Competition Active" badge appears on that stand's card
- [ ] Customer split in a shared zone is shown on the end-of-day results ("You captured 63% of the zone's traffic today")
- [ ] A rival that closes is removed from the map with a notification ("Billy's Lemonade has closed! Zone is now yours.")

---

## 4. V2 Features (Post-Launch)

These features are out of scope for MVP but are designed to maintain long-term engagement and expand the player base. V2 development begins after 30 days of MVP live data.

### 4.1 Brick & Mortar Stores (Stage 4–5)

- Transition from street stands to permanent storefronts
- Monthly rent mechanics — fixed cost creates meaningful financial pressure
- Interior customization: counters, signage, seating capacity
- Staff hiring: cashier, juicer, cleaner — each with wage costs and morale stats
- Customer wait time mechanic: store capacity limits throughput
- **Design note:** This is the first major monetization hook — cosmetic store upgrades will be offered as optional IAP

### 4.2 Expanded Menu (Stage 4–6)

- New products: Pretzels, Churros, Flavored Lemonades, Iced Teas
- Cross-sell combos: "Pretzel + Lemonade Combo" at a discount
- Each product has its own recipe system and ingredient supply chain
- Product research tree: must invest time/money to unlock new menu items
- Seasonal limited-time offerings (e.g., Pumpkin Spice Lemonade in fall)

### 4.3 Franchise System (Stage 6–7)

- License your brand to AI-controlled franchise partners
- Set franchise fee (% of revenue) and quality standards
- Franchisee satisfaction score — if quality drops, they cancel the contract
- Franchise disputes: random events that require resolution mini-games
- Passive income stream from franchises (core idle mechanic at this stage)

### 4.4 National & International Expansion (Stage 8–10)

- Unlock new cities (New York, Los Angeles, Chicago, London, Tokyo, etc.)
- Each city has unique customer preferences, ingredient costs, and regulatory environments
- Currency conversion for international locations (simplified exchange rate)
- Cultural adaptation research: unlock city-specific specialty drinks
- International logistics mini-game: manage supply chain across time zones

### 4.5 Stock Market Integration (Stage 7+)

- "LemonadeCo" can go public in a simplified in-game stock market
- Share price responds to daily profits, events, and player decisions
- Investors can provide capital in exchange for equity (diluting player control score)
- Short-selling competitor stocks (narrative flavor, not real mechanics)
- IPO event with market cap milestone as a major end-game milestone

### 4.6 Multiplayer & Leaderboards

- Global leaderboard: top players by net worth, total customers served, days survived
- Weekly seasonal leaderboard with cosmetic rewards for top 100
- "Business Battle" mode: 7-day head-to-head competition between two players
- Friend system: view friends' business stats on their profile page
- Co-op franchise: two players can own a franchise chain together (V3 consideration)

---

## 5. Key Metrics to Track

All metrics should be surfaced in the analytics dashboard and reviewed weekly by the product team.

### 5.1 Engagement Metrics

| Metric | Definition | Target (30 days post-launch) |
|---|---|---|
| Daily Active Users (DAU) | Unique users who complete at least 1 day simulation | 1,000+ |
| Weekly Active Users (WAU) | Unique users active in the last 7 days | 3,500+ |
| Monthly Active Users (MAU) | Unique users active in the last 30 days | 10,000+ |
| DAU/MAU Ratio | Stickiness ratio (higher = more daily habit) | >= 0.25 |
| Average Session Length | Mean time from first action to last action per session | >= 8 minutes |
| Sessions per DAU | Average number of separate sessions per active day | >= 2.5 |

### 5.2 Retention Metrics

| Metric | Definition | Target |
|---|---|---|
| D1 Retention | % of new users who return the following day | >= 45% |
| D7 Retention | % of new users who return 7 days after sign-up | >= 20% |
| D30 Retention | % of new users who return 30 days after sign-up | >= 10% |
| Churn Rate (weekly) | % of WAU who do not return the following week | <= 30% |

### 5.3 Progression Funnel

Track the % of all registered users who reach each stage. This is the most important product health signal.

| Stage | Name | Target % of All Users |
|---|---|---|
| Stage 1 | Neighborhood Stand | 100% (entry) |
| Stage 2 | Multiple Stands | >= 60% |
| Stage 3 | Permits & Legitimacy | >= 30% |
| Stage 4 (V2) | Brick & Mortar | >= 15% |
| Stage 5+ | | TBD post-MVP |

**Funnel drop-off analysis:** Any stage with a drop-off greater than 50% warrants an investigation sprint within 2 weeks of detection.

### 5.4 Revenue Metrics (if monetized)

| Metric | Definition | Target |
|---|---|---|
| ARPU | Average Revenue Per User (monthly) | TBD |
| ARPPU | Average Revenue Per Paying User (monthly) | TBD |
| Conversion Rate | % of users who make any purchase | TBD |
| LTV | Lifetime Value per user | TBD |

**Note:** MVP launches as free-to-play with no monetization. Monetization strategy will be defined in V2 based on engagement data and user interviews.

### 5.5 Quality Metrics

| Metric | Definition | Target |
|---|---|---|
| Crash Rate | % of sessions ending in unhandled error | <= 0.5% |
| API Error Rate | % of API calls returning 5xx errors | <= 0.1% |
| P95 Page Load Time | 95th percentile page load time (desktop) | <= 2 seconds |
| P95 Day Simulation Time | 95th percentile time to compute and return day results | <= 500ms |
| CSAT (in-app survey) | Customer satisfaction score (1–5, sampled at Day 7) | >= 4.0 |

---

## 6. Priority Matrix

### P0 — Must Have for Launch

These items block the MVP from shipping. The game is not functional or not fun without them.

| Feature | User Story(s) | Notes |
|---|---|---|
| Core day simulation loop | US-001 | Central game mechanic |
| Supply purchasing system | US-002 | Required for day simulation |
| Recipe system with visual feedback | US-003, US-008 | Core skill expression |
| Price setting | US-004 | Required for day simulation |
| Day simulation engine (backend) | US-001 | All customer/weather calculations |
| End-of-day results screen | US-001, US-006 | Feedback loop closure |
| Weather system (all 6 states) | US-005 | Strategic variance driver |
| Stage 1 complete (upgrades, win condition) | US-009 | First progression beat |
| Stage 2 complete (multi-stand) | US-010 | Second progression beat |
| Stage 3 complete (permits) | US-011 | Third progression beat |
| Auto-save + server-side persistence | US-013 | Prevents player frustration |
| User account creation + login | — | Required for save system |
| Financial dashboard | US-012 | Core feedback + engagement |
| Basic competitor AI (Stage 1–2) | US-016 | Creates tension and urgency |
| 20 MVP achievements (triggers + display) | US-015 | Retention and onboarding reinforcement |
| Offline progress calculation | US-014 | Re-engagement mechanic |
| Mobile-responsive layout (all screens) | — | Large portion of target audience |

### P1 — Should Have for Launch

These items significantly improve quality or retention but do not block a functional launch.

| Feature | Notes |
|---|---|
| Onboarding tutorial (first 3 days guided) | Critical for D1 retention |
| Animated day simulation sequence | Increases satisfaction; plain results are acceptable fallback |
| Customer segment breakdown in results | Adds strategic depth to results screen |
| Recipe preset save/load system | Reduces friction for returning players |
| Weather forecast (tomorrow) | Adds planning depth; game works without it |
| "Suggested Recipe" AI hint | Reduces new player frustration |
| Stage progress panel (always visible) | Clarity on goals; can ship without if results screen shows it |
| Competitor spy action | Adds strategy; game works without it |
| 7-day financial charts | Trend visibility; single-day stats are acceptable MVP fallback |
| Achievement gallery screen | Toast notifications alone are acceptable launch fallback |
| Local IndexedDB save fallback | Protects against intermittent connectivity |

### P2 — Nice to Have

These items add polish, depth, or delight but are not blocking. Target for the first post-launch patch.

| Feature | Notes |
|---|---|
| Narrative event messages (random flavor text) | "A school group arrived!" — adds life to results |
| Weather app upgrade (95% forecast accuracy) | Small but meaningful upgrade purchase |
| Animated customer reaction face on recipe screen | Pure delight; static icon is acceptable |
| "Dominate a Zone" competitor mechanic | More complex competitive play |
| Daily P&L export (CSV) | Power user feature |
| Keyboard shortcuts for power users | Speed up experienced player loops |
| Sound effects and background music | Significant polish uplift |
| Cosmetic stand customization (colors, signs) | Personalization / identity |
| Bulk supply purchase discount (Stage 2) | Minor economic optimization |

### P3 — Future Consideration

These items are intentionally deferred to V2 or later.

| Feature | Notes |
|---|---|
| Brick & mortar stores | Stage 4+ |
| Expanded menu (pretzels, churros) | Stage 4+ |
| Franchise system | Stage 6+ |
| National/international expansion | Stage 8+ |
| Stock market | Stage 7+ |
| Multiplayer / leaderboards | V2 after engagement baseline |
| Co-op franchise | V3 |
| In-app purchases / monetization | Post-engagement baseline |
| Seasonal events | Post-launch content update |
| Mobile native app (iOS/Android) | Post product-market fit confirmation |

---

## 7. Game Flow

### 7.1 New Player Experience (Onboarding / Tutorial)

The tutorial is a guided, non-skippable experience for the first 3 days. It uses coach marks and modal overlays — it does not lock the player into a separate mode.

```
SESSION 1 — "Your First Day"

[Landing screen]
  -> "Start Your Stand" CTA
  -> Account creation (email + password, or "Play as Guest")

[Cinematic intro: 8 seconds]
  -> Pixel-art animation: player receives a hand-written note
     "Grandma left you $50 and her secret lemonade recipe. Good luck."
  -> Fade to: main game screen, Day 1, Sunny & Mild weather

[Tutorial Step 1 — Buy Supplies]
  -> Coach mark highlights Supply Shop button
  -> Pre-filled quantities for exactly 20 cups
  -> "Purchase" CTA — player clicks to confirm
  -> Cash deducts with a satisfying animation

[Tutorial Step 2 — Set Recipe]
  -> Coach mark highlights Recipe button
  -> Sliders pre-filled at Grandma's recipe (3-star quality)
  -> Real-time quality feedback shown
  -> "This looks good! You can tweak it later." tooltip

[Tutorial Step 3 — Set Price]
  -> Coach mark highlights Price input
  -> Default price pre-filled at $0.75
  -> Recommended range shown: $0.50–$1.00
  -> "Ready to open?" CTA

[Day 1 Simulation — Animated]
  -> Customers approach, some buy, some walk by
  -> Coin animation plays for each sale
  -> Day ends: 14 customers, $10.50 revenue, $5.50 profit

[End-of-Day Results — Day 1]
  -> Full results screen with coach marks on each section
  -> Achievement toast fires: "Fresh Squeezed" unlocked! +$5 bonus
  -> "Tomorrow's Forecast: Sunny & Hot — customers will want cold drinks!"

[CTA to continue to Day 2]
```

**Tutorial Days 2–3** follow the same structure but introduce:
- Day 2: Adjusting recipe for hot weather (Ice mechanic), price adjustment
- Day 3: First upgrade purchase (Sidewalk Chalk Sign), sees competitor appear

After Day 3, tutorial overlays disappear and the player plays freely.

---

### 7.2 Core Game Loop (Post-Tutorial)

```
MAIN SCREEN
+-----------------------------------------------------------------------+
| LEMONADE STAND TYCOON         [Save: 2 min ago]   [Day 14 | $187.50] |
| Stage 1: Neighborhood Stand   [|||||||----] $187 / $300 to Stage 2   |
+-----------------------------------------------------------------------+
|                                                                       |
|   TODAY: Sunny & Hot  [Icon]                                          |
|   "Scorching! Customers want ice-cold drinks. Price premium likely."  |
|                                                                       |
|   [BUY SUPPLIES]  [SET RECIPE]  [SET PRICE: $1.10]  [OPEN STAND]     |
|                                                                       |
|   Inventory: 40 lemons | 20 tbsp sugar | 30 ice units                |
|                                                                       |
|   [Dashboard]  [Achievements (3 new!)]  [Upgrades]  [Competitors]    |
+-----------------------------------------------------------------------+
```

Player decision flow per day:
1. Read weather condition
2. Check inventory (carried-over supplies)
3. Buy supplies (adjust for today's weather forecast)
4. Adjust recipe if needed (or use saved preset)
5. Adjust price if needed
6. Simulate day
7. Review results
8. Purchase upgrades if affordable
9. Return to Step 1

Expected active time per loop: 60–90 seconds.
Expected sessions per day: 2–3 (morning check-in, lunch loop, evening session).

---

### 7.3 Progression Triggers

These are the moments that create excitement and investment. Each trigger is a mini-celebration event.

| Trigger | What Fires |
|---|---|
| Reach $100 cash | Achievement toast + "Century Club" badge on profile |
| Stage 1 win condition met | Congratulations modal + Stage 2 preview cinematic |
| First upgrade purchased | "Now we're cooking!" narrative message |
| First competitor appears | Tutorial tip: "Billy's Lemonade just opened nearby. Keep your prices competitive." |
| Stage 2 unlock | New "Stands Map" UI element animates into the interface |
| First Manager hired | Manager character sprite appears on stand card |
| Stage 3 unlock | "Congratulations — you're a real business now" narrative + new Permits UI |
| First city event booked | "Market Day" achievement + event countdown timer |

---

### 7.4 Engagement Hooks

These mechanics are designed to create a reason to return each day and within each session.

| Hook | Mechanic | Frequency |
|---|---|---|
| Daily weather reveal | New weather each day creates planning decisions | Every session |
| "Streak" bonus | Consecutive profitable days grant a multiplier (up to +10%) | Ongoing |
| Tomorrow's forecast | Creates anticipation for the next session | End of every day |
| Achievement progress | Near-complete achievements shown as progress bars | Passive |
| Competitor actions | Rival price changes or zone moves create urgency | Random |
| Random events | "School fair tomorrow — 2x kids traffic forecasted" | 10% of days |
| Upgrade milestone | Every $50 increment, a new upgrade becomes affordable | Ongoing |
| Stage progress bar | Always visible, always moving | Ongoing |

---

### 7.5 Re-Engagement Mechanics

These mechanics are designed to bring players back after they have been inactive for 1+ days.

| Mechanic | Description | Trigger |
|---|---|---|
| Offline progress | Player returns to see accumulated earnings and a day-by-day recap | Any login after 6+ hours |
| "We missed you" event | After 3 days away, a rare bonus weather event ("Golden Day") fires on return | 3+ days absent |
| Rival takeover warning | Email/push notification: "Billy's Lemonade is dominating your zone!" | If rival captures >50% zone traffic for 3 days |
| Streak reset warning | Email/push notification: "Your 7-day streak ends tomorrow!" | Streak >= 5 days, player hasn't logged in for 20+ hours |
| New achievement unlock teaser | "You're 1 day away from unlocking 'The Grind'!" | When achievement is within 10% of completion |
| Seasonal event announcement | In-app banner + optional notification: "Summer Heatwave Event — this weekend only!" | V2 seasonal events |

**Notification opt-in:** All push and email notifications are opt-in only. Prompted once at Day 7 if the player has not yet configured preferences.

---

## 8. Appendix: Progression Stage Definitions

### All 10 Stages (Full Game Vision)

| Stage | Name | Theme | Key Unlock |
|---|---|---|---|
| 1 | Neighborhood Stand | Starting small, learning basics | Core game loop |
| 2 | Multiple Stands | Expansion and delegation | Multi-location management |
| 3 | Permits & Legitimacy | Regulatory and competitive pressure | City permits, events |
| 4 | Brick & Mortar Store | First permanent location | Staff hiring, rent mechanics |
| 5 | Regional Chain | Systemizing operations | Franchise templates, SOP system |
| 6 | Franchise Launch | Passive income via franchising | Franchise partner AI |
| 7 | National Brand | Going public, PR events | Stock market, national ad campaigns |
| 8 | International Expansion | Cultural and logistical complexity | Multi-currency, cultural adaptation |
| 9 | Global Beverage Empire | Portfolio of brands | Brand acquisition, product lines |
| 10 | The Lemonade Mogul | End game prestige | Prestige reset option, legacy score |

**Prestige system (Stage 10):** Players who reach Stage 10 can choose to reset to Stage 1 with a permanent "Legacy Multiplier" that boosts starting earnings on the next run. This drives replayability and long-term retention.

---

*Document maintained by the Product Team. Last updated: 2026-04-03.*
*For engineering specifications, see `/docs/architecture.md`. For business model details, see `/docs/business-model.md`.*
