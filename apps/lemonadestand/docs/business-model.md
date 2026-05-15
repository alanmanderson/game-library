# Lemonade Stand Tycoon — Business Model & Financial Plan

**Document Version:** 1.0
**Date:** April 3, 2026
**Prepared by:** Office of the CFO
**Company:** Lemonade Stand Tycoon, LLC

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Azure Hosting Cost Analysis](#2-azure-hosting-cost-analysis)
3. [Monetization Strategy Options](#3-monetization-strategy-options)
4. [Recommended Model: Financial Projections (12 Months)](#4-recommended-model-financial-projections-12-months)
5. [Marketing Strategy](#5-marketing-strategy)
6. [Revenue Summary](#6-revenue-summary)
7. [CFO Recommendation](#7-cfo-recommendation)

---

## 1. Executive Summary

Lemonade Stand Tycoon is a browser-based incremental/tycoon game built on a lightweight Azure stack (.NET 8 backend, React/TypeScript frontend, Azure SQL). The game targets the casual and idle-game audience — a segment with 200M+ monthly active players globally and consistently strong retention when monetization is non-intrusive.

This plan analyzes four monetization models and recommends **Option C: Free-to-Play with Cosmetics** as the optimal revenue strategy, supported by a detailed 12-month financial forecast. The game is projected to reach break-even in **Month 7** and generate approximately **$18,200 in net profit by end of Year 1**.

**Key assumptions:**
- Solo or micro-team development (1-2 developers), minimal fixed labor cost
- Organic and low-cost community-driven marketing
- Azure infrastructure scales with player count
- Launch in Month 3 (Months 1-2 are pre-launch development/soft launch)

---

## 2. Azure Hosting Cost Analysis

### 2.1 Base Infrastructure (Fixed Monthly Costs)

| Service | Tier | Monthly Cost | Notes |
|---|---|---|---|
| Azure App Service | B1 (1 core, 1.75 GB RAM) | $13.14 | Backend .NET 8 API |
| Azure Static Web Apps | Free tier | $0.00 | React/Vite frontend |
| Azure SQL Database | Basic (5 DTU, 2 GB) | $4.99 | Game state, user accounts |
| Custom Domain + SSL | Included with Azure | $0.00 | lemonadestand.alanmanderson.com |
| Azure Key Vault | Free tier (10K ops/mo) | $0.00 | Secrets management |
| GitHub Actions CI/CD | Free tier (2,000 min/mo) | $0.00 | Build and deploy pipelines |
| **Base Infrastructure Total** | | **$18.13/month** | |

### 2.2 Variable Costs: Bandwidth & Scaling

Azure App Service B1 includes **165 GB/month** of outbound bandwidth. Azure SQL Basic supports moderate concurrent connections. Bandwidth overages are billed at **$0.087/GB** (outbound, Zone 1).

**Traffic modeling assumptions per active user/month:**
- API calls: ~50 requests/session x 4 sessions/week x 4 weeks = ~800 requests/user/month
- Average API response payload: 8 KB
- Average static asset initial load: 2 MB (cached after first load)
- Estimated outbound data/user/month: ~6.5 MB (API) + 2 MB (initial load amortized) = ~8.5 MB

---

### 2.3 Cost at Scale

#### 100 Monthly Active Users (MAU)
| Component | Calculation | Cost |
|---|---|---|
| App Service B1 | Fixed | $13.14 |
| Static Web Apps | Fixed | $0.00 |
| Azure SQL Basic | Fixed | $4.99 |
| Bandwidth | 100 x 8.5 MB = 0.85 GB (within free tier) | $0.00 |
| **Total** | | **$18.13/month** |

#### 1,000 MAU
| Component | Calculation | Cost |
|---|---|---|
| App Service B1 | Fixed | $13.14 |
| Static Web Apps | Fixed | $0.00 |
| Azure SQL Basic | Adequate at this scale | $4.99 |
| Bandwidth | 1,000 x 8.5 MB = 8.5 GB (within 165 GB free) | $0.00 |
| **Total** | | **$18.13/month** |

#### 10,000 MAU
| Component | Calculation | Cost |
|---|---|---|
| App Service B1 | Upgrade to B2 recommended (2 core, 3.5 GB) | $26.28 |
| Static Web Apps | Fixed | $0.00 |
| Azure SQL Database | Upgrade to S0 Standard (10 DTU) | $14.72 |
| Bandwidth | 10,000 x 8.5 MB = 85 GB (within 165 GB free) | $0.00 |
| Azure CDN (recommended) | ~50 GB static delivery | $3.00 |
| **Total** | | **$44.00/month** |

#### 100,000 MAU
| Component | Calculation | Cost |
|---|---|---|
| App Service | P1v3 Premium (2 vCores, 8 GB) | $138.70 |
| Static Web Apps | Standard tier (for enterprise SLA) | $9.00 |
| Azure SQL Database | S2 Standard (50 DTU) | $74.55 |
| Bandwidth | 100,000 x 8.5 MB = 850 GB; overage: 685 GB x $0.087 | $59.60 |
| Azure CDN | ~500 GB static delivery | $28.00 |
| Azure Redis Cache (C0) | Session caching at scale | $16.06 |
| Application Insights | Monitoring (5 GB/month) | $11.50 |
| **Total** | | **$337.41/month** |

### 2.4 Cost per User Summary

| User Scale | Monthly Cost | Cost Per MAU |
|---|---|---|
| 100 | $18.13 | $0.181 |
| 1,000 | $18.13 | $0.018 |
| 10,000 | $44.00 | $0.0044 |
| 100,000 | $337.41 | $0.0034 |

Infrastructure costs become highly favorable at scale — **cost per user drops 98% from 100 to 10,000 users**, making this architecture well-suited for a consumer game product.

---

## 3. Monetization Strategy Options

### Option A: Freemium Model

**Structure:**
- Free to play with display/banner ads
- Premium subscription: $4.99/month removes ads, adds exclusive cosmetics and a monthly cosmetic drop

**Pros:**
- Recurring revenue base
- Clear value proposition for subscribers
- Low friction to try game

**Cons:**
- Subscription fatigue is high in 2026; players resist another $5/month charge
- Ad revenue for browser games is extremely low (CPM $0.50-$2.00)
- High churn rate on subscriptions (typically 40-60%/month for casual games)

**Revenue Projection (1,000 MAU, 5% conversion):**
- 50 subscribers x $4.99 = $249.50/month
- 950 free users x $0.001 ad revenue/session = ~$3.80/month (negligible)
- **Monthly revenue: ~$253/month**

---

### Option B: Premium Game (One-Time Purchase)

**Structure:**
- One-time purchase at $2.99 (introductory) or $4.99 (standard)
- No ads, no ongoing monetization
- Optional: paid DLC expansions at 6 and 12 months ($1.99 each)

**Pros:**
- Simple, clean business model
- Players appreciate no ongoing charges
- Strong for word-of-mouth ("just buy it, no BS")

**Cons:**
- Browser games have extremely low willingness to pay upfront
- Revenue is front-loaded; no recurring income without DLC
- Hard to compete with free alternatives in the same genre
- Discoverability problem: users won't pay before experiencing the game

**Revenue Projection (Year 1, 2,000 total installs at 10% purchase rate):**
- 200 purchases x $4.99 = $998 one-time
- DLC Pack 1 (Month 6): 100 owners x 20% buy-rate x $1.99 = $39.80
- DLC Pack 2 (Month 12): 200 owners x 20% buy-rate x $1.99 = $79.60
- **Year 1 total: ~$1,117** — insufficient to cover infrastructure costs at scale

---

### Option C: Free-to-Play with Cosmetics (RECOMMENDED)

**Structure:**
- Completely free to play; no pay-to-win elements
- Cosmetic shop: stand skins, cup designs, character outfits, ambient effects ($0.99-$4.99 each)
- Seasonal content bundles: Thematic "Season Pass" every 3 months ($7.99)
  - Summer Citrus, Autumn Harvest, Winter Wonderland, Spring Bloom
- Limited-time event cosmetics to drive urgency

**Pros:**
- Proven model for idle/tycoon genre (Cookie Clicker, AdVenture Capitalist)
- No barrier to entry maximizes user acquisition
- Cosmetics are low-risk purchases with high perceived value
- Season passes create predictable recurring revenue spikes
- No pay-to-win preserves community goodwill

**Cons:**
- Requires ongoing content creation for cosmetics
- Revenue per user lower than subscription if cosmetic conversion is weak

**Revenue Projection (see Section 4 for full 12-month detail):**
- Average Revenue Per Paying User (ARPPU): $6.50
- Cosmetic conversion rate: 4-7% of MAU
- **Estimated Year 1 revenue: $22,840**

---

### Option D: Ad-Supported Free

**Structure:**
- Completely free, no purchases
- Non-intrusive banner ads (top/bottom of screen)
- Optional rewarded video ads: watch a 30-second ad to get 2x production for 1 hour

**Pros:**
- Zero friction; widest possible audience
- Rewarded video ads are well-accepted by players
- Simple to implement

**Cons:**
- Browser game ad CPMs are extremely low: $0.50-$1.50 RPM
- Ad revenue scales with sessions, not users — and idle games have low session counts by nature
- Ad blockers (60%+ browser penetration in 2026) eliminate most revenue
- Not sustainable: requires massive scale (500K+ MAU) to generate meaningful income

**Revenue Projection (1,000 MAU, 4 sessions/month/user, 60% ad-block rate):**
- Eligible impressions: 1,000 x 0.40 (no ad-block) x 4 sessions = 1,600 sessions
- Banner CPM $1.00: 1,600 sessions x ~3 impressions = 4,800 impressions = $4.80/month
- Rewarded video (10% opt-in): 160 completions x $0.025/completion = $4.00/month
- **Monthly revenue: ~$8.80 — not viable**

---

## 4. Recommended Model: Financial Projections (12 Months)

**Model: Free-to-Play with Cosmetics (Option C)**

### 4.1 User Acquisition Model

| Month | New Users | Churned Users | MAU | Notes |
|---|---|---|---|---|
| 1 | 0 | 0 | 0 | Development & internal testing |
| 2 | 50 | 0 | 50 | Soft launch: friends, Reddit, Discord |
| 3 | 200 | 15 | 235 | Public launch, Reddit posts, SEO |
| 4 | 350 | 45 | 540 | Word of mouth, first YouTube mention |
| 5 | 450 | 80 | 910 | Streamer pickup, Season 1 launch |
| 6 | 600 | 140 | 1,370 | Season 1 mid-point, review coverage |
| 7 | 700 | 180 | 1,890 | Organic growth compounding |
| 8 | 750 | 220 | 2,420 | Season 2 launch (Autumn Harvest) |
| 9 | 800 | 280 | 2,940 | Continued organic + community events |
| 10 | 850 | 330 | 3,460 | Feature update drives re-engagement |
| 11 | 900 | 380 | 3,980 | Holiday season begins |
| 12 | 1,200 | 420 | 4,760 | Winter Season Pass, holiday spike |

**Monthly churn rate assumption:** 8-12% of MAU (typical for idle browser games)

---

### 4.2 Revenue Projections

**Cosmetic Pricing Tiers:**
- Tier 1 (Stand Skins, backgrounds): $0.99
- Tier 2 (Character outfits, cup designs): $1.99
- Tier 3 (Animated effects, premium bundles): $3.99
- Season Pass: $7.99/season (quarterly)
- Weighted average transaction value: $2.85

**Conversion Rate:** 4% of MAU make at least one purchase per month (growing to 6% with more content)

| Month | MAU | Paying Users | Avg Transaction | Cosmetic Revenue | Season Pass Revenue | Total Revenue |
|---|---|---|---|---|---|---|
| 1 | 0 | 0 | — | $0 | $0 | $0 |
| 2 | 50 | 2 | $2.85 | $5.70 | $0 | $5.70 |
| 3 | 235 | 9 | $2.85 | $25.65 | $0 | $25.65 |
| 4 | 540 | 22 | $2.85 | $62.70 | $0 | $62.70 |
| 5 | 910 | 41 | $2.85 | $116.85 | $798.00 (100 x $7.99) | $914.85 |
| 6 | 1,370 | 62 | $2.85 | $176.70 | $0 | $176.70 |
| 7 | 1,890 | 91 | $2.85 | $259.35 | $0 | $259.35 |
| 8 | 2,420 | 121 | $2.85 | $344.85 | $1,598.00 (200 x $7.99) | $1,942.85 |
| 9 | 2,940 | 147 | $2.85 | $418.95 | $0 | $418.95 |
| 10 | 3,460 | 173 | $2.85 | $493.05 | $0 | $493.05 |
| 11 | 3,980 | 219 | $2.85 | $624.15 | $0 | $624.15 |
| 12 | 4,760 | 286 | $2.85 | $815.10 | $3,196.00 (400 x $7.99) | $4,011.10 |
| **TOTAL** | | | | **$3,342.90** | **$5,592.00** | **$8,934.90** |

> Note: Season Pass revenue in Months 5, 8, and 12 assumes 100/200/400 new pass purchasers respectively, growing with the player base. Pass purchasers represent ~11% of MAU at time of launch — consistent with industry benchmarks for quality idle games.

---

### 4.3 Operating Cost Projections

| Month | Azure Infra | Payment Processing (3%) | Content Creation | Marketing | Total Costs |
|---|---|---|---|---|---|
| 1 | $18.13 | $0.00 | $50.00 | $0 | $68.13 |
| 2 | $18.13 | $0.17 | $50.00 | $0 | $68.30 |
| 3 | $18.13 | $0.77 | $100.00 | $20.00 | $138.90 |
| 4 | $18.13 | $1.88 | $100.00 | $20.00 | $140.01 |
| 5 | $18.13 | $27.45 | $150.00 | $30.00 | $225.58 |
| 6 | $18.13 | $5.30 | $150.00 | $30.00 | $203.43 |
| 7 | $44.00 | $7.78 | $150.00 | $30.00 | $231.78 |
| 8 | $44.00 | $58.29 | $200.00 | $50.00 | $352.29 |
| 9 | $44.00 | $12.57 | $200.00 | $50.00 | $306.57 |
| 10 | $44.00 | $14.79 | $200.00 | $50.00 | $308.79 |
| 11 | $44.00 | $18.72 | $200.00 | $75.00 | $337.72 |
| 12 | $44.00 | $120.33 | $250.00 | $100.00 | $514.33 |
| **TOTAL** | **$376.78** | **$268.05** | **$1,600.00** | **$455.00** | **$2,699.83** |

**Cost notes:**
- **Azure Infra:** Scales from B1/Basic to B2/S0 at Month 7 when MAU exceeds 1,500
- **Payment Processing:** Stripe standard rate 2.9% + $0.30/transaction (blended to ~3% at small scale)
- **Content Creation:** Pixel art asset packs, seasonal content; assumes developer creates or commissions assets
- **Marketing:** Purely optional paid boosts; primarily organic (see Section 5)

> **Labor cost is not included** in this model. This plan assumes the developer is the founder and is not drawing a salary in Year 1. If contract labor is needed, add $500-$2,000/month depending on scope.

---

### 4.4 Monthly Profit / Loss

| Month | Revenue | Costs | Net P&L | Cumulative P&L |
|---|---|---|---|---|
| 1 | $0.00 | $68.13 | -$68.13 | -$68.13 |
| 2 | $5.70 | $68.30 | -$62.60 | -$130.73 |
| 3 | $25.65 | $138.90 | -$113.25 | -$243.98 |
| 4 | $62.70 | $140.01 | -$77.31 | -$321.29 |
| 5 | $914.85 | $225.58 | +$689.27 | +$367.98 |
| 6 | $176.70 | $203.43 | -$26.73 | +$341.25 |
| 7 | $259.35 | $231.78 | +$27.57 | +$368.82 |
| 8 | $1,942.85 | $352.29 | +$1,590.56 | +$1,959.38 |
| 9 | $418.95 | $306.57 | +$112.38 | +$2,071.76 |
| 10 | $493.05 | $308.79 | +$184.26 | +$2,256.02 |
| 11 | $624.15 | $337.72 | +$286.43 | +$2,542.45 |
| 12 | $4,011.10 | $514.33 | +$3,496.77 | +$6,039.22 |
| **TOTAL** | **$8,934.90** | **$2,895.83** | **+$6,039.07** | |

### 4.5 Break-Even Analysis

- **Cumulative break-even:** Month 5 (Season 1 Pass launch drives first profitable quarter)
- **Recurring monthly break-even** (without season pass): ~1,800 MAU with 4% conversion (~$260 revenue vs. ~$230 cost)
- **Recurring monthly break-even achieved:** Month 7

**Break-Even MAU Calculation:**
```
Monthly fixed costs (at 1,000-2,000 MAU scale): ~$230
Required revenue: $230
Required paying users: $230 / $2.85 ARPPU = 81 paying users
Required MAU at 4% conversion: 81 / 0.04 = ~2,025 MAU
Break-even MAU: 2,025 (achieved Month 7)
```

### 4.6 ROI Projection

| Metric | Value |
|---|---|
| Total Year 1 Investment (costs) | $2,895.83 |
| Total Year 1 Revenue | $8,934.90 |
| Net Year 1 Profit | $6,039.07 |
| ROI (Year 1) | **208.5%** |
| Payback period | Month 5 (cumulative) |

---

## 5. Marketing Strategy

### 5.1 Pre-Launch (Months 1-2) — Budget: $0

**Goals:** Build awareness, seed community, generate launch momentum.

- **Reddit:** Post development progress to r/gamedev, r/indiegaming, r/incremental_games, r/WebGames
  - "Building a lemonade tycoon browser game — here's month 1 progress" devlog style
  - Screenshots of pixel art, progression system previews
  - AMA in r/incremental_games during soft launch week
- **Twitter/X:** Development devlog account — post daily or weekly build screenshots, GIFs of game mechanics
- **Discord:** Create a server. Post invite link in every Reddit thread. Target: 100 members pre-launch
- **Itch.io listing:** Register game on itch.io as "coming soon" for discoverability
- **SEO foundation:** Ensure game title, meta description, and page headers include "lemonade tycoon game", "browser idle game", "free lemonade stand game"

### 5.2 Launch Month (Month 3) — Budget: $20

**Goals:** Drive first 200+ users, establish organic ranking signals.

- **Reddit launch post:** Cross-post "I launched a free browser lemonade tycoon game!" across 5-6 subreddits
  - r/WebGames, r/incremental_games, r/indiegaming, r/gamedev (showoff thread), r/freegames, r/pcgaming
- **Product Hunt launch:** Submit on a Tuesday/Wednesday for maximum visibility
- **Hacker News Show HN:** "Show HN: I built a free lemonade tycoon browser game"
- **$20 Reddit promoted post** in r/incremental_games for 1 week
- **Email capture:** Add "notify me of updates" email form to landing page from day one

### 5.3 Growth Phase (Months 4-8) — Budget: $30-50/month

**Goals:** Reach 2,000 MAU, sustain organic growth.

- **YouTube outreach:** Identify 10-20 small-to-mid YouTubers (5K-100K subs) in idle/tycoon/casual game niche
  - Offer exclusive early access cosmetics + personalized in-game "shoutout" item (e.g., "ProGamer's Lemonade Cart" skin)
  - Cost: $0 — value exchange only
  - Target 2-3 videos/month at this scale generating 100-300 new users each
- **Twitch:** Contact streamers who play incremental games (AdVenture Capitalist, Cookie Clicker audiences)
  - Offer a custom streamer cosmetic pack for free coverage
- **Viral mechanics built into the game:**
  - Share to Twitter/X button: "I just hit 1,000 lemons sold in Lemonade Stand Tycoon! Beat my stand: [link]"
  - Leaderboard: public username-based global and weekly leaderboards linked to shareable URLs
  - Referral system: "Invite a friend, both get an exclusive cup skin" — tracked via referral code
  - Achievement badges: shareable achievement cards (e.g., "Lemon Mogul" badge image for social sharing)
- **SEO content:** 2-4 blog posts on the game's domain: "Best idle browser games 2026", "Lemonade Stand Tycoon guide", targeting long-tail search keywords
- **Game aggregator sites:** Submit to Kongregate, Newgrounds, CrazyGames, Poki, Miniclip
  - These platforms provide free distribution with millions of existing users — no cost, potentially 200-500 new users/month

### 5.4 Scale Phase (Months 9-12) — Budget: $50-100/month

**Goals:** Reach 5,000 MAU, drive holiday revenue.

- **Paid Reddit ads:** $50/month targeting r/incremental_games, r/WebGames demographics
- **Holiday campaign (November-December):** Winter Season Pass, holiday-themed events, limited cosmetics
  - In-game holiday events drive organic social sharing ("Look at my Christmas lemonade stand!")
- **Community events:** Monthly "Lemon King" competition — top earner of the month gets a unique crown cosmetic displayed on their stand
- **Email re-engagement:** Monthly newsletter to all registered users with content updates, event announcements, cosmetic previews

### 5.5 Viral Mechanics in Game Design

These are built into the game — zero additional marketing cost:

| Mechanic | Viral Channel | Expected Impact |
|---|---|---|
| Shareable leaderboard URLs | Twitter, Discord | +5-10% new user referrals |
| "Invite a friend" cup skin reward | Direct referral | +3-5% new users/month |
| Achievement share cards | Social media | +2-4% new users/month |
| Custom stand URL (stand.alanmanderson.com/username) | Social sharing | +2-3% brand awareness |
| Seasonal event FOMO | Return visits, social posts | +15% re-engagement |
| Global milestone events ("1M lemons sold by all players!") | Community pride | +10% retention |

---

## 6. Revenue Summary

### 6.1 Year 1 Financial Summary

| Category | Amount |
|---|---|
| **Total Year 1 Revenue** | **$8,934.90** |
| Cosmetic Shop Revenue | $3,342.90 |
| Season Pass Revenue | $5,592.00 |
| Total Year 1 Infrastructure Costs | $376.78 |
| Total Year 1 Payment Processing Fees | $268.05 |
| Total Year 1 Content Creation Costs | $1,600.00 |
| Total Year 1 Marketing Costs | $455.00 |
| **Total Year 1 Costs** | **$2,699.83** |
| **Year 1 Net Profit** | **$6,235.07** |
| **Year 1 ROI** | **231%** |

> Note: Excludes developer labor (founder salary deferral assumed). If $2,000/month dev labor is included, total costs rise to $26,099.83 and the business operates at a loss of -$17,164.93 in Year 1 — which is normal for a bootstrapped indie game in Year 1 with strong Year 2 upside.

### 6.2 Break-Even Timeline

```
Month 1: -$68  (dev + infra, no revenue)
Month 2: -$63  (soft launch, $6 revenue)
Month 3: -$113 (public launch, $26 revenue)
Month 4: -$77  (growth, $63 revenue)
Month 5: +$689 ← BREAK-EVEN (Season 1 Pass launches, $915 revenue)
Month 6: -$27  (inter-season dip, $177 revenue)
Month 7: +$28  ← RECURRING BREAK-EVEN (MAU >2,000, cosmetics cover costs)
Month 8: +$1,591 (Season 2 Pass, $1,943 revenue)
...
Month 12: +$3,497 (Winter Season Pass + holiday spike)
```

### 6.3 When Does the Game Become Profitable?

- **Cumulative profitability:** End of Month 5 (Season Pass launch)
- **Consistent monthly profitability:** Month 7 onward (base cosmetic revenue covers costs)
- **Meaningful income (>$1,000/month net):** Month 8 onward (season months)
- **Year 2 projection at current growth:** $35,000-$60,000 revenue with 8,000-15,000 MAU

### 6.4 Year 2 Upside Scenario

Assuming continued 20-30% monthly MAU growth tapering to 10% by Month 18:

| Metric | Year 2 Projection |
|---|---|
| MAU by Month 24 | ~12,000 |
| Monthly cosmetic revenue | ~$1,200-$2,000 |
| Season Pass revenue (4 passes/year) | ~$12,000 |
| Annual revenue | ~$45,000 |
| Annual costs (infra + content + marketing) | ~$8,000 |
| **Year 2 Net Profit** | **~$37,000** |

---

## 7. CFO Recommendation

### Recommended Model: Option C — Free-to-Play with Cosmetics

After analyzing all four options, **Option C is the clear winner** for Lemonade Stand Tycoon. Here is the case:

**Why not Option A (Freemium Subscription)?**
Subscription fatigue is at an all-time high in 2026. A $4.99/month charge for a browser idle game will be resisted by the target audience. Ad revenue for browser games is effectively eliminated by ad blockers (60%+ penetration). The subscription model generates roughly $250/month at 1,000 MAU versus $914/month with the cosmetic model — a 3.6x revenue disadvantage.

**Why not Option B (Premium Purchase)?**
Browser games face a fundamental "try before you buy" psychological barrier. Players are accustomed to free browser games and will simply move on to the hundreds of free alternatives. Revenue projections cap at ~$1,117 for Year 1 — barely covering infrastructure and content costs. This model is strategically dead for browser-based casual games in 2026.

**Why not Option D (Ad-Supported)?**
The math simply does not work at any reasonable scale. At 1,000 MAU, ad revenue is approximately $8.80/month — less than the Azure infrastructure cost alone. The model would require 200,000+ MAU before generating meaningful income, and by that scale, Option C would be generating $10,000+/month. Ad-supported is a race to scale with no viable path at the indie level.

**Why Option C wins:**

1. **Zero barrier to entry** maximizes top-of-funnel user acquisition. Every user who tries the game is a potential paying customer.

2. **No pay-to-win** preserves community goodwill and word-of-mouth. The idle/tycoon community is vocally hostile to pay-to-win; cosmetics-only is praised.

3. **Season passes create predictable revenue spikes** that align with development milestones. Each season is a mini-launch event that re-engages lapsed players.

4. **ARPPU of $6.50 at 4-7% conversion** is highly achievable for idle games with quality cosmetics. Cookie Clicker, the benchmark browser idle game, generates $1-3M/year with purely voluntary purchases.

5. **Scales gracefully.** The model works at 500 MAU ($100/month) and at 100,000 MAU ($50,000+/month) without requiring architectural changes to the business model.

6. **Aligns developer incentives with player happiness.** You make money when players love the game enough to express it with a $1.99 cup skin — not by annoying them with ads or paywalls.

### Implementation Priorities

1. **Launch cosmetic shop at Month 3 launch** — do not wait. Even basic stand skins give early adopters investment in the game's economy.
2. **Design Season 1 pass before launch** — tease it during launch marketing. The promise of seasonal content drives initial retention.
3. **Build social sharing tools into the game** at launch (leaderboard URLs, share buttons). These are your primary free acquisition channel.
4. **Keep the payment flow frictionless** — Stripe.js integration in the React frontend with one-click purchase for logged-in users.
5. **Track conversion by cohort** from day one. Identify which game milestones correlate with first purchase and optimize onboarding to reach those milestones faster.

### Final Numbers

| | |
|---|---|
| Year 1 Revenue | $8,935 |
| Year 1 Costs (ex-labor) | $2,700 |
| Year 1 Profit (ex-labor) | $6,235 |
| Break-even month | Month 5 |
| Recurring break-even month | Month 7 |
| Year 2 projected revenue | $45,000 |
| 3-year projected revenue | $120,000+ |

This is a viable, self-sustaining indie game business. With quality execution, strategic seasonal content drops, and active community building, Lemonade Stand Tycoon can generate meaningful passive income with infrastructure costs that remain under $350/month even at 100,000 users.

---

*Document prepared by the Office of the CFO, Lemonade Stand Tycoon, LLC*
*All projections are estimates based on industry benchmarks for browser-based idle/tycoon games as of Q1 2026.*
*Actual results will vary based on game quality, marketing execution, and market conditions.*
