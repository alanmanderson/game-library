# Lemonade Stand Tycoon - Game Design Document

## 1. Game Overview

**Title:** Lemonade Stand Tycoon
**Genre:** Business Simulation / Tycoon / Idle
**Platform:** Web Browser (Desktop & Mobile)
**Target Audience:** Ages 12-35, casual-to-mid-core gamers

### Elevator Pitch
Start with $50 and a dream. Build a neighborhood lemonade stand into a global beverage empire. Master recipes, manage employees, survive disasters, and dominate the market — one cup at a time.

## 2. Core Game Loop

```
Buy Supplies → Set Recipe → Set Price → Advance Day → See Results → Reinvest
```

Each "day" takes 60-90 seconds of active play. Players make strategic decisions about:
- **Recipe**: How much water, sugar, ice, and lemons per cup
- **Pricing**: Balance profit per cup vs. customer volume
- **Inventory**: How much to stock (perishable items lose value)
- **Expansion**: When to open new stands, hire employees, expand menu

## 3. Progression Stages

### Stage 1: Neighborhood Stand ($50 start)
- Single stand on a residential street
- Manual recipe mixing
- Buy supplies at corner store prices
- Goal: Reach $300 cash + 200 customers served

### Stage 2: Multiple Stands (Unlocks at $300)
- Open up to 3 stands in different locations
- Hire first employee (cashier)
- Location selection affects foot traffic
- Goal: Reach $2,000 cash + 1,000 customers

### Stage 3: Permits & Regulations (Unlocks at $2,000)
- Must obtain city permits ($100-$500)
- Health inspections can shut you down
- More locations available (parks, downtown)
- Goal: Reach $10,000 cash + 5,000 customers

### Stage 4: Brick & Mortar (Unlocks at $10,000)
- Open permanent store locations
- Expanded menu: pretzels ($2), churros ($2.50)
- Kitchen equipment upgrades
- Goal: Reach $50,000 cash

### Stage 5: Multi-Store Chain (Unlocks at $50,000)
- 5-20 store locations
- Management layer (managers handle daily operations)
- Supply chain optimization
- Goal: Reach $250,000 cash

### Stage 6: Franchise Empire (Unlocks at $250,000)
- Sell franchise licenses ($10,000 each)
- Brand management & quality control
- Passive income from franchises
- Goal: 50 total locations

### Stage 7: State Expansion (Unlocks at 50 locations)
- Multi-city operations
- Regional marketing campaigns
- Supply chain logistics
- Goal: 200 locations across 5 cities

### Stage 8: National Chain (Unlocks at 200 locations)
- National advertising campaigns
- Corporate structure & executives
- Supplier negotiations for bulk pricing
- Goal: 1,000 locations

### Stage 9: International Empire (Unlocks at 1,000 locations)
- Cultural adaptation for different markets
- Currency exchange considerations
- International supply chains
- Goal: 5,000 locations across 10 countries

### Stage 10: Global Domination (Unlocks at 5,000 locations)
- Stock market IPO
- Acquisitions of competitors
- Prestige system (reset for permanent bonuses)
- Infinite scaling with prestige multipliers

## 4. Recipe System

### Ingredients per Cup
| Ingredient | Amount Used | Cost per Unit |
|-----------|-------------|---------------|
| Water | 0.1 gallons | $0.10/gallon |
| Lemons | 0.1 pounds | $1.50/pound |
| Sugar | 0.05 pounds | $0.80/pound |
| Ice | 0.1 pounds | $0.50/pound |
| Cup | 1 cup | $0.04/cup ($2/50) |

**Cost per cup**: ~$0.24 at default ratios

### Quality Score Calculation
Quality is 0-100 based on how close the recipe matches the "ideal" for current conditions:
- Base ideal: 4 water, 2 lemon, 1.5 sugar, 2 ice
- Hot weather: more ice (3.5), less sugar (1.0)
- Cold weather: less ice (1.0), more sugar (2.0)
- Quality = 100 × (1 - average_deviation_from_ideal)

## 5. Weather System

| Weather | Temperature | Demand Multiplier | Frequency |
|---------|------------|-------------------|-----------|
| Sunny | 75-85°F | 1.3x | 30% |
| Partly Cloudy | 70-80°F | 1.1x | 20% |
| Cloudy | 60-75°F | 0.9x | 15% |
| Rainy | 55-70°F | 0.5x | 15% |
| Heatwave | 95-110°F | 1.8x | 5% |
| Stormy | 50-65°F | 0.3x | 8% |
| Cold | 30-50°F | 0.4x | 5% |
| Snowy | 25-35°F | 0.2x | 1.5% |
| Hurricane | N/A | 0.0x | 0.5% |

Seasons affect weather distribution:
- Summer: More sunny, heatwaves
- Winter: More cold, snowy
- Spring/Fall: Balanced

## 6. Customer Simulation

### Purchase Probability
```
base_demand = foot_traffic × weather_multiplier
price_factor = max(0, 1 - (price - 1.0) × 0.3)
quality_factor = recipe_quality / 100
reputation_factor = reputation / 3.0
event_factor = active_event_multiplier

actual_customers = base × price × quality × reputation × event × random(0.8, 1.2)
```

### Customer Satisfaction
After purchasing, each customer rates their experience:
```
satisfaction = (quality × 0.5) + (value_for_money × 0.3) + (random × 0.2)
```
This feeds into the reputation/Yelp rating system.

## 7. Economy & Pricing

### Supply Prices
| Item | Price | Quantity |
|------|-------|----------|
| Cups | $2.00 | Pack of 50 |
| Lemons | $1.50 | 1 pound |
| Sugar | $0.80 | 1 pound |
| Ice | $0.50 | 1 pound |
| Water | $0.10 | 1 gallon |
| Pretzels | $5.00 | Pack of 10 |
| Churros | $6.00 | Pack of 10 |

### Employee Wages (Daily)
| Role | Base Wage | Benefit |
|------|-----------|---------|
| Cashier | $15 | +10% customer throughput |
| Cook | $20 | +10% recipe quality |
| Manager | $35 | Can run a stand autonomously |
| Marketer | $25 | +15% foot traffic |
| Accountant | $30 | -10% supply costs |

## 8. Random Events

Events have a 5% chance of occurring each day:

| Event | Impact | Duration |
|-------|--------|----------|
| Heatwave Festival | +80% demand | 3 days |
| Health Inspection | -$200 fine if violations | 1 day |
| Viral TikTok | +100% demand | 2 days |
| Competitor Opens | -20% demand | 7 days |
| Supply Shortage | +50% supply costs | 5 days |
| Celebrity Visit | +150% demand | 1 day |
| Street Festival | +60% demand | 2 days |
| Pipe Burst | Stand closed | 2 days |
| Employee Strike | All employees stop | 3 days |
| Food Trend | +40% demand for specific items | 5 days |
| Economic Boom | +20% all revenue | 10 days |
| Recession | -20% all revenue | 10 days |
| Lawsuit | -$500 to $5000 | 1 day |

## 9. Fail Conditions

1. **Bankruptcy**: Cash drops below $0 with no sellable inventory
2. **Reputation Collapse**: Yelp rating drops below 1.5 stars for 5+ days
3. **Health Code Shutdown**: 3 failed health inspections
4. **Competitor Domination**: Competitor takes >80% market share for 10+ days

## 10. Achievements (30 Initial)

### Sales
1. 🍋 First Cup - Sell your first cup of lemonade
2. 💯 Century Club - Sell 100 cups
3. 🏪 Thousand Cups - Sell 1,000 cups
4. 🏭 Industrial - Sell 10,000 cups
5. 🌍 Million Cups - Sell 1,000,000 cups

### Revenue
6. 💵 First Dollar - Earn your first dollar
7. 💰 Benjamin - Reach $100 cash
8. 🤑 Thousandaire - Reach $1,000 cash
9. 💎 Ten Grand - Reach $10,000 cash
10. 👑 Millionaire - Reach $1,000,000 cash

### Expansion
11. 📍 Second Location - Open your second stand
12. 🏢 Chain Store - Have 5 stands operating
13. 🏗️ Empire Builder - Have 20 stands
14. 🌐 Global Reach - Expand internationally
15. 🎯 Franchise Mogul - Sell 10 franchises

### Recipe
16. 👨‍🍳 Perfect Recipe - Achieve 95+ quality score
17. 🧪 Mad Scientist - Try 20 different recipes
18. ⭐ Five Star Chef - Get 5.0 Yelp rating
19. 🥨 Menu Expansion - Sell pretzels for the first time
20. 🍹 Mixologist - Unlock all menu items

### Reputation
21. ⭐ Rising Star - Reach 4.0 reputation
22. 🌟 Local Legend - Reach 4.5 reputation
23. 💫 National Treasure - Reach 5.0 reputation

### Survival
24. 🎯 Survivor - Play for 30 days
25. 💪 Veteran - Play for 100 days
26. 🏆 Legend - Play for 365 days
27. 🌪️ Storm Survivor - Stay profitable through a hurricane
28. 🥊 Competition Crusher - Outlast 5 competitors

### Special
29. 🎲 Lucky Day - Earn 5x your daily average
30. 🔥 Hot Streak - 10 profitable days in a row
