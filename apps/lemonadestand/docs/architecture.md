# Lemonade Stand Tycoon - Backend Architecture Document

## Table of Contents
1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [Architecture Layers](#architecture-layers)
4. [Data Models](#data-models)
5. [API Endpoints](#api-endpoints)
6. [Game Engine](#game-engine)
7. [Service Layer](#service-layer)
8. [Repository Layer](#repository-layer)
9. [Real-Time Updates](#real-time-updates)
10. [Configuration and Middleware](#configuration-and-middleware)

---

## Overview

The backend is a .NET 8 Web API using clean architecture with three layers:
- **LemonadeStand.Api** - HTTP surface (controllers, middleware, SignalR hubs)
- **LemonadeStand.Core** - Domain models, interfaces, game engine, service contracts
- **LemonadeStand.Data** - EF Core DbContext, repositories, SQLite persistence

Dependency flow: Api -> Core <- Data (Core has zero outward dependencies).

## Project Structure

```
backend/
├── LemonadeStand.sln
├── LemonadeStand.Api/
│   ├── LemonadeStand.Api.csproj
│   ├── Program.cs
│   ├── appsettings.json
│   ├── Controllers/
│   │   ├── GameController.cs
│   │   ├── StandController.cs
│   │   ├── RecipeController.cs
│   │   ├── EmployeeController.cs
│   │   ├── FinanceController.cs
│   │   ├── UpgradeController.cs
│   │   ├── AchievementController.cs
│   │   └── EventController.cs
│   ├── Hubs/
│   │   └── GameHub.cs
│   ├── Middleware/
│   │   └── ExceptionHandlingMiddleware.cs
│   └── Configuration/
│       └── ServiceRegistration.cs
├── LemonadeStand.Core/
│   ├── LemonadeStand.Core.csproj
│   ├── Models/
│   │   ├── GameState.cs
│   │   ├── Player.cs
│   │   ├── Stand.cs
│   │   ├── Recipe.cs
│   │   ├── Employee.cs
│   │   ├── Location.cs
│   │   ├── Inventory.cs
│   │   ├── InventoryItem.cs
│   │   ├── Transaction.cs
│   │   ├── Achievement.cs
│   │   ├── GameEvent.cs
│   │   ├── DayResult.cs
│   │   ├── CustomerFeedback.cs
│   │   ├── Competitor.cs
│   │   ├── Upgrade.cs
│   │   ├── UpgradeOwned.cs
│   │   ├── WeatherCondition.cs
│   │   └── Enums/
│   │       ├── GameStage.cs
│   │       ├── StandType.cs
│   │       ├── EmployeeRole.cs
│   │       ├── EmployeeSkillLevel.cs
│   │       ├── SupplyType.cs
│   │       ├── TransactionType.cs
│   │       ├── EventSeverity.cs
│   │       ├── WeatherType.cs
│   │       ├── LocationTier.cs
│   │       ├── UpgradeCategory.cs
│   │       └── AchievementCategory.cs
│   ├── Interfaces/
│   │   ├── IGameRepository.cs
│   │   ├── IStandRepository.cs
│   │   ├── IRecipeRepository.cs
│   │   ├── IEmployeeRepository.cs
│   │   ├── ITransactionRepository.cs
│   │   ├── IAchievementRepository.cs
│   │   ├── IGameService.cs
│   │   ├── IStandService.cs
│   │   ├── IRecipeService.cs
│   │   ├── IEmployeeService.cs
│   │   ├── IFinanceService.cs
│   │   ├── IUpgradeService.cs
│   │   ├── IAchievementService.cs
│   │   └── IEventService.cs
│   ├── Services/
│   │   ├── GameService.cs
│   │   ├── StandService.cs
│   │   ├── RecipeService.cs
│   │   ├── EmployeeService.cs
│   │   ├── FinanceService.cs
│   │   ├── UpgradeService.cs
│   │   ├── AchievementService.cs
│   │   └── EventService.cs
│   └── Engine/
│       ├── GameEngine.cs
│       ├── CustomerSimulator.cs
│       ├── WeatherGenerator.cs
│       ├── EventGenerator.cs
│       ├── CompetitorAi.cs
│       ├── ProgressionManager.cs
│       └── BalanceConstants.cs
├── LemonadeStand.Data/
│   ├── LemonadeStand.Data.csproj
│   ├── GameDbContext.cs
│   ├── Configuration/
│   │   ├── GameStateConfiguration.cs
│   │   └── ... (EF entity configs)
│   └── Repositories/
│       ├── GameRepository.cs
│       ├── StandRepository.cs
│       ├── RecipeRepository.cs
│       ├── EmployeeRepository.cs
│       ├── TransactionRepository.cs
│       └── AchievementRepository.cs
└── LemonadeStand.Tests/
    ├── LemonadeStand.Tests.csproj
    ├── Unit/
    │   ├── Services/
    │   └── Engine/
    │       ├── GameEngineTests.cs
    │       ├── CustomerSimulatorTests.cs
    │       └── WeatherGeneratorTests.cs
    └── Integration/
        └── GameControllerTests.cs
```

## API Endpoints

### Game Management
| Method | Route | Description |
|--------|-------|-------------|
| POST | /api/game | Create a new game |
| GET | /api/game | List all saved games |
| GET | /api/game/{id} | Load a saved game (full state) |
| PUT | /api/game/{id} | Save current game state |
| DELETE | /api/game/{id} | Delete a saved game |
| POST | /api/game/{id}/advance-day | Advance the simulation by one day |
| GET | /api/game/{id}/state | Get current game state snapshot |
| POST | /api/game/{id}/advance-days/{count} | Advance multiple days (offline catch-up) |

### Stand Management
| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/game/{gameId}/stands | List all owned stands |
| POST | /api/game/{gameId}/stands | Buy a new stand |
| GET | /api/game/{gameId}/stands/{id} | Get stand details |
| PUT | /api/game/{gameId}/stands/{id} | Update stand settings (name, location) |
| DELETE | /api/game/{gameId}/stands/{id} | Sell a stand |
| GET | /api/game/{gameId}/locations | List available locations |

### Recipe Management
| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/game/{gameId}/recipes | List all recipes |
| POST | /api/game/{gameId}/recipes | Create a custom recipe |
| PUT | /api/game/{gameId}/recipes/{id} | Update a recipe |
| DELETE | /api/game/{gameId}/recipes/{id} | Delete a custom recipe |
| PUT | /api/game/{gameId}/stands/{standId}/recipe | Assign recipe to a stand |

### Employee Management
| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/game/{gameId}/employees | List all employees |
| POST | /api/game/{gameId}/employees | Hire a new employee |
| GET | /api/game/{gameId}/employees/{id} | Get employee details |
| PUT | /api/game/{gameId}/employees/{id} | Update employee (assign stand, set wage) |
| DELETE | /api/game/{gameId}/employees/{id} | Fire an employee |
| POST | /api/game/{gameId}/employees/{id}/train | Train an employee (costs money+time) |

### Financial Operations
| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/game/{gameId}/finance/summary | Get financial summary |
| GET | /api/game/{gameId}/finance/transactions | Get transaction history |
| POST | /api/game/{gameId}/finance/buy-supplies | Purchase supplies |
| PUT | /api/game/{gameId}/stands/{standId}/price | Set cup price for a stand |
| GET | /api/game/{gameId}/finance/report/{period} | Get P&L report (daily/weekly/monthly) |

### Upgrades and Progression
| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/game/{gameId}/upgrades | List all available upgrades |
| GET | /api/game/{gameId}/upgrades/owned | List purchased upgrades |
| POST | /api/game/{gameId}/upgrades/{upgradeId}/buy | Purchase an upgrade |

### Achievements
| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/game/{gameId}/achievements | List all achievements and status |
| GET | /api/game/{gameId}/achievements/unlocked | List unlocked achievements |

### Events and Weather
| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/game/{gameId}/weather | Get current and forecast weather |
| GET | /api/game/{gameId}/events | Get active events |
| GET | /api/game/{gameId}/events/history | Get past events |
| GET | /api/game/{gameId}/feedback | Get recent customer feedback |

---

## Game Engine

### Day Advancement Flow
1. Generate weather for the day
2. Roll for random events
3. Update competitor behavior
4. For each stand: simulate customer traffic
5. Calculate revenue (cups sold x price)
6. Calculate expenses (supplies, wages, rent, utilities)
7. Deduct supply inventory
8. Process employee effects (morale, skill growth)
9. Generate customer feedback
10. Check achievement conditions
11. Check progression stage advancement
12. Calculate offline progress if applicable
13. Persist DayResult and updated GameState

### Customer Simulation
Base traffic = location.BaseFootTraffic * weatherMultiplier * eventMultiplier
Adjusted traffic = baseTraffic * standAppealScore * competitorPenalty
For each potential customer:
  - priceWillingness = baseWillingness * (qualityScore / avgPrice)
  - purchaseProbability = clamp(priceWillingness * satisfactionBonus, 0.05, 0.95)
  - Roll for purchase
  - If purchased: deduct supplies, add revenue, generate optional feedback

### Progression Stages
- Neighborhood (Day 1): Single stand, basic recipe
- Block Party (Revenue $500): Second stand slot, sugar variety
- Downtown (Revenue $5,000): 4 stands, employees, new recipes
- City-Wide ($50,000): 8 stands, marketing, upgrades tree
- Regional ($500,000): Multiple cities, franchise model
- National ($5,000,000): Bottled product line, distribution
- Global ($50,000,000): International markets, stock price

---

This document is the source of truth for backend implementation.
