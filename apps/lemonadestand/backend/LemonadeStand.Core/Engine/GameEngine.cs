using LemonadeStand.Core.Enums;
using LemonadeStand.Core.Models;

namespace LemonadeStand.Core.Engine;

public static class GameEngine
{
    private static readonly Random Rng = new();

    public static GameState NewGame(string playerName)
    {
        var gameState = new GameState
        {
            Id = Guid.NewGuid(),
            PlayerName = string.IsNullOrWhiteSpace(playerName) ? "Player" : playerName.Trim(),
            Cash = 50.00m,
            Day = 1,
            Stage = GameStage.NeighborhoodStand,
            Reputation = 3.0,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        gameState.Inventory = new Inventory
        {
            Cups = 25,
            Lemons = 3.0,
            Sugar = 2.0,
            Ice = 3.0,
            Water = 3.0
        };

        gameState.Stands.Add(new Stand
        {
            Id = Guid.NewGuid(),
            Name = playerName + "'s Lemonade Stand",
            LocationType = LocationType.Residential,
            LocationName = "Home Street",
            FootTraffic = 50,
            Rent = 0m,
            IsOpen = true,
            Level = 1,
            PricePerCup = 1.00m,
        });

        var recipe = new Recipe
        {
            Id = Guid.NewGuid(),
            Name = "Classic Lemonade",
            WaterRatio = 0.10,
            LemonRatio = 0.10,
            SugarRatio = 0.05,
            IceRatio = 0.10,
        };
        gameState.Recipes.Add(recipe);
        gameState.Stands[0].RecipeId = recipe.Id;
        gameState.Achievements = GetAchievementDefinitions();
        return gameState;
    }

    public static DayResult AdvanceDay(GameState state)
    {
        if (state.IsGameOver)
        {
            return new DayResult
            {
                Day = state.Day,
                Events = new List<string> { "Game is over! Start a new game." },
                CashAfter = state.Cash,
            };
        }

        var result = new DayResult { Day = state.Day };
        var weather = GenerateWeather(state.Day);
        result.Weather = weather.Type;
        result.Temperature = weather.Temperature;
        result.Season = weather.Season;

        ProcessActiveEvents(state);
        ProcessCityEvents(state);
        var newEvent = GenerateEvent(state);
        if (newEvent != null)
        {
            state.ActiveEvents.Add(newEvent);
            result.Events.Add(newEvent.Title + ": " + newEvent.Description);
        }
        var newCityEvent = GenerateCityEvent(state);
        if (newCityEvent != null)
        {
            state.CityEvents.Add(newCityEvent);
            result.Events.Add(newCityEvent.Title + ": " + newCityEvent.Description);
        }

        // Update competitor strength based on player quality/price
        UpdateCompetitorStrength(state, result);

        double eventMultiplier = 1.0;
        foreach (var evt in state.ActiveEvents.Where(e => e.IsActive))
        {
            if (evt.Type == EventType.Competitor)
                eventMultiplier *= (0.7 + 0.3 * (1.0 - evt.CompetitorStrength));
            else
                eventMultiplier *= evt.ImpactMultiplier;
        }

        int totalCustomers = 0;
        int totalCupsSold = 0;
        decimal totalRevenue = 0m;
        double totalSatisfaction = 0;
        int satisfactionSamples = 0;
        bool inventoryRanOut = false;

        foreach (var stand in state.Stands.Where(s => s.IsOpen))
        {
            var recipe = state.Recipes.FirstOrDefault(r => r.Id == stand.RecipeId);
            if (recipe == null) { result.Notifications.Add(stand.Name + ": No recipe assigned!"); continue; }

            double weatherMult = weather.DemandMultiplier;
            double reputationMult = state.Reputation / 3.0;
            double cityEventMult = GetCityEventMultiplier(state, stand.LocationType);
            double baseDemand = stand.FootTraffic * weatherMult * cityEventMult;
            double priceFactor = Math.Max(0, 1.0 - ((double)stand.PricePerCup - 1.0) * 0.3);
            double qualityScore = recipe.GetQualityScore(weather.Type, weather.Temperature);
            double qualityFactor = qualityScore / 100.0;
            double randomFactor = 0.8 + Rng.NextDouble() * 0.4;
            double potentialCustomers = baseDemand * priceFactor * qualityFactor * reputationMult * eventMultiplier * randomFactor;

            double employeeBonus = 1.0;
            foreach (var emp in state.Employees)
            {
                if (emp.Role == EmployeeRole.Cashier) employeeBonus += emp.Skill * 0.001;
                else if (emp.Role == EmployeeRole.Marketer) employeeBonus += emp.Skill * 0.002;
                else if (emp.Role == EmployeeRole.Manager) employeeBonus += emp.Skill * 0.0015;
            }
            potentialCustomers *= employeeBonus;

            int customersWanting = Math.Max(0, (int)Math.Round(potentialCustomers));
            int cupsSoldThisStand = 0;

            for (int i = 0; i < customersWanting; i++)
            {
                if (!HasIngredientsForCup(state.Inventory, recipe))
                { inventoryRanOut = true; break; }

                double satisfaction = (qualityScore / 100.0) * 0.5 + priceFactor * 0.3 + (state.Reputation / 5.0) * 0.2;
                double buyChance = Math.Clamp(satisfaction, 0.1, 0.95);

                if (Rng.NextDouble() < buyChance)
                {
                    state.Inventory.Cups -= 1;
                    state.Inventory.Lemons -= recipe.LemonRatio;
                    state.Inventory.Sugar -= recipe.SugarRatio;
                    state.Inventory.Ice -= recipe.IceRatio;
                    state.Inventory.Water -= recipe.WaterRatio;
                    cupsSoldThisStand++;
                    totalRevenue += stand.PricePerCup;
                    totalSatisfaction += satisfaction;
                    satisfactionSamples++;
                }
                totalCustomers++;
            }
            totalCupsSold += cupsSoldThisStand;
            if (cupsSoldThisStand > 0) result.Notifications.Add(stand.Name + ": Sold " + cupsSoldThisStand + " cups at $" + stand.PricePerCup.ToString("F2") + " each.");
            else result.Notifications.Add(stand.Name + ": No cups sold today.");
        }

        if (inventoryRanOut) { result.InventoryRanOut = true; result.Notifications.Add("Ran out of supplies! Buy more."); }

        decimal expenses = 0m;
        foreach (var stand in state.Stands) expenses += stand.Rent;
        foreach (var emp in state.Employees)
        {
            expenses += emp.Wage;
            emp.DaysEmployed++;
            emp.Satisfaction = Math.Max(10, emp.Satisfaction - 1);
            if (emp.Wage < 10m && emp.Skill > 70) emp.Satisfaction = Math.Max(10, emp.Satisfaction - 1);
        }

        result.Revenue = totalRevenue;
        result.Expenses = expenses;
        result.CustomerCount = totalCustomers;
        result.CupsSold = totalCupsSold;
        result.CustomerSatisfaction = satisfactionSamples > 0 ? totalSatisfaction / satisfactionSamples * 100 : 50;

        state.Cash += totalRevenue - expenses;
        state.TotalRevenue += totalRevenue;
        state.TotalExpenses += expenses;
        state.CustomersServed += totalCustomers;
        state.CupsSold += totalCupsSold;

        if (totalCupsSold > 0)
        {
            double avgSat = satisfactionSamples > 0 ? totalSatisfaction / satisfactionSamples : 0.5;
            double repChange = (avgSat * 5.0 - state.Reputation) * 0.1;
            state.Reputation = Math.Clamp(state.Reputation + repChange, 1.0, 5.0);
        }
        else state.Reputation = Math.Clamp(state.Reputation - 0.05, 1.0, 5.0);

        state.Inventory.Ice = Math.Max(0, state.Inventory.Ice * 0.8);

        var progression = CheckProgression(state);
        if (progression != null) { result.NewStageReached = progression; result.Notifications.Add("You reached stage: " + progression + "!"); }

        if (state.Cash < -10m && state.Inventory.Cups == 0 && state.Inventory.Lemons < 0.1 && state.Inventory.Sugar < 0.05)
        {
            state.IsGameOver = true;
            state.GameOverReason = "Bankrupt! Ran out of money and supplies.";
            result.Events.Add(state.GameOverReason);
        }

        var newAch = CheckAchievements(state);
        result.NewAchievements = newAch;
        foreach (var a in newAch) result.Notifications.Add("Achievement: " + a.Name + "!");

        result.CashAfter = state.Cash;
        state.DayHistory.Add(result);
        state.Day++;
        state.UpdatedAt = DateTime.UtcNow;
        return result;
    }

    // Returns true if inventory has enough of every ingredient to serve one cup with this recipe.
    private static bool HasIngredientsForCup(Inventory inv, Recipe recipe) =>
        inv.Cups >= 1 &&
        inv.Lemons >= recipe.LemonRatio &&
        inv.Sugar >= recipe.SugarRatio &&
        inv.Ice >= recipe.IceRatio &&
        inv.Water >= recipe.WaterRatio;

    // Returns true if there are enough supplies across any open stand's recipe to serve at least one cup.
    public static bool HasSuppliesForAtLeastOneCup(GameState state)
    {
        if (state.Inventory.Cups < 1) return false;
        foreach (var stand in state.Stands)
        {
            if (!stand.IsOpen) continue;
            var recipe = state.Recipes.FirstOrDefault(r => r.Id == stand.RecipeId);
            if (recipe == null) continue;
            if (HasIngredientsForCup(state.Inventory, recipe)) return true;
        }
        return false;
    }

    public static bool BuySupplies(GameState state, int cupPacks, double lemons, double sugar, double ice, double water)
    {
        var prices = GetSupplyPrices(state);
        decimal totalCost = cupPacks * prices.CupsPer50Pack + (decimal)lemons * prices.LemonsPerLb
            + (decimal)sugar * prices.SugarPerLb + (decimal)ice * prices.IcePerLb + (decimal)water * prices.WaterPerGallon;
        if (totalCost > state.Cash || totalCost <= 0) return false;
        state.Cash -= totalCost;
        state.TotalExpenses += totalCost;
        state.Inventory.Cups += cupPacks * 50;
        state.Inventory.Lemons += lemons;
        state.Inventory.Sugar += sugar;
        state.Inventory.Ice += ice;
        state.Inventory.Water += water;
        state.UpdatedAt = DateTime.UtcNow;
        return true;
    }

    public static List<LocationOption> GetAvailableLocations(GameState state)
    {
        var locs = new List<LocationOption>
        {
            new LocationOption { Name = "Home Street", Type = LocationType.Residential, FootTraffic = 50, Rent = 0m, RequiresPermit = false, BuildCost = 0m },
            new LocationOption { Name = "Maple Avenue", Type = LocationType.Residential, FootTraffic = 60, Rent = 0m, RequiresPermit = false, BuildCost = 10m },
            new LocationOption { Name = "Central Park", Type = LocationType.Park, FootTraffic = 100, Rent = 5m, RequiresPermit = false, BuildCost = 25m },
            new LocationOption { Name = "Riverside Park", Type = LocationType.Park, FootTraffic = 80, Rent = 3m, RequiresPermit = false, BuildCost = 20m },
        };
        if ((int)state.Stage >= (int)GameStage.MultipleStands)
        {
            locs.Add(new LocationOption { Name = "Oak Elementary", Type = LocationType.School, FootTraffic = 120, Rent = 5m, RequiresPermit = false, BuildCost = 30m });
            locs.Add(new LocationOption { Name = "Suburban Plaza", Type = LocationType.SuburbanStrip, FootTraffic = 100, Rent = 10m, RequiresPermit = false, BuildCost = 50m });
        }
        if ((int)state.Stage >= (int)GameStage.PermitsAndRegulations)
        {
            locs.Add(new LocationOption { Name = "Main Street", Type = LocationType.Downtown, FootTraffic = 200, Rent = 25m, RequiresPermit = true, BuildCost = 100m });
            locs.Add(new LocationOption { Name = "City Center", Type = LocationType.Downtown, FootTraffic = 250, Rent = 35m, RequiresPermit = true, BuildCost = 120m });
        }
        if ((int)state.Stage >= (int)GameStage.BrickAndMortar)
        {
            locs.Add(new LocationOption { Name = "Sunset Beach", Type = LocationType.Beach, FootTraffic = 300, Rent = 50m, RequiresPermit = true, BuildCost = 150m });
            locs.Add(new LocationOption { Name = "Lakeside Beach", Type = LocationType.Beach, FootTraffic = 250, Rent = 40m, RequiresPermit = true, BuildCost = 120m });
        }
        if ((int)state.Stage >= (int)GameStage.MultiStoreChain)
        {
            locs.Add(new LocationOption { Name = "Westfield Mall", Type = LocationType.Mall, FootTraffic = 500, Rent = 100m, RequiresPermit = true, BuildCost = 250m });
            locs.Add(new LocationOption { Name = "Gateway Mall", Type = LocationType.Mall, FootTraffic = 400, Rent = 80m, RequiresPermit = true, BuildCost = 200m });
        }
        if ((int)state.Stage >= (int)GameStage.FranchiseModel)
        {
            locs.Add(new LocationOption { Name = "City Stadium", Type = LocationType.SportVenue, FootTraffic = 800, Rent = 200m, RequiresPermit = true, BuildCost = 500m });
            locs.Add(new LocationOption { Name = "Highway Rest Stop", Type = LocationType.Highway, FootTraffic = 350, Rent = 60m, RequiresPermit = true, BuildCost = 75m });
        }
        var occupied = state.Stands.Select(s => s.LocationName).ToHashSet();
        return locs.Where(l => !occupied.Contains(l.Name)).ToList();
    }

    public static Stand? OpenNewStand(GameState state, string locationName, LocationType locationType)
    {
        var locs = GetAvailableLocations(state);
        var loc = locs.FirstOrDefault(l => l.Name == locationName);
        if (loc == null) return null;
        int maxStands = GetMaxStands(state.Stage);
        if (state.Stands.Count >= maxStands) return null;
        if (loc.RequiresPermit && !state.Permits.Any(p => p.IsActive && p.Type == PermitType.StreetVending)) return null;
        if (state.Cash < loc.BuildCost) return null;
        state.Cash -= loc.BuildCost;
        state.TotalExpenses += loc.BuildCost;
        var stand = new Stand { Id = Guid.NewGuid(), Name = state.PlayerName + "'s Stand #" + (state.Stands.Count + 1),
            LocationType = loc.Type, LocationName = loc.Name, FootTraffic = loc.FootTraffic, Rent = loc.Rent, IsOpen = true, Level = 1, PricePerCup = 1.00m };
        if (state.Recipes.Count > 0) stand.RecipeId = state.Recipes[0].Id;
        state.Stands.Add(stand);
        state.UpdatedAt = DateTime.UtcNow;
        return stand;
    }

    public static Employee? HireEmployee(GameState state, string name, EmployeeRole role)
    {
        decimal wage = GetBaseWage(role);
        if (state.Cash < wage * 3) return null;
        var emp = new Employee { Id = Guid.NewGuid(), Name = string.IsNullOrWhiteSpace(name) ? GenName() : name,
            Role = role, Wage = wage, Skill = 30 + Rng.Next(41), Satisfaction = 75 + Rng.Next(16), DaysEmployed = 0 };
        state.Employees.Add(emp);
        state.UpdatedAt = DateTime.UtcNow;
        return emp;
    }

    public static SupplyPrices GetSupplyPrices(GameState state)
    {
        var p = new SupplyPrices { CupsPer50Pack = 2.00m, LemonsPerLb = 1.50m, SugarPerLb = 0.80m, IcePerLb = 0.50m, WaterPerGallon = 0.10m };
        foreach (var evt in state.ActiveEvents.Where(e => e.IsActive))
        {
            if (evt.Type == EventType.SupplyShortage) { p.LemonsPerLb *= 1.5m; p.SugarPerLb *= 1.3m; }
            else if (evt.Type == EventType.EconomicBoom) { p.LemonsPerLb *= 1.1m; p.SugarPerLb *= 1.1m; }
            else if (evt.Type == EventType.EconomicRecession) { p.LemonsPerLb *= 0.85m; p.SugarPerLb *= 0.85m; p.CupsPer50Pack *= 0.9m; }
        }
        var season = GetSeason(state.Day);
        if (season == Season.Summer) { p.IcePerLb *= 1.2m; p.LemonsPerLb *= 0.9m; }
        else if (season == Season.Winter) { p.LemonsPerLb *= 1.3m; p.IcePerLb *= 0.8m; }
        return p;
    }

    public static GameStage? CheckProgression(GameState state)
    {
        var cur = state.Stage;
        GameStage ns = cur;
        if (state.TotalRevenue >= 100000m && (int)cur < 10) ns = GameStage.GlobalDomination;
        else if (state.TotalRevenue >= 50000m && (int)cur < 9) ns = GameStage.InternationalEmpire;
        else if (state.TotalRevenue >= 25000m && (int)cur < 8) ns = GameStage.NationalChain;
        else if (state.TotalRevenue >= 10000m && (int)cur < 7) ns = GameStage.StateExpansion;
        else if (state.TotalRevenue >= 5000m && (int)cur < 6) ns = GameStage.FranchiseModel;
        else if (state.TotalRevenue >= 2000m && (int)cur < 5) ns = GameStage.MultiStoreChain;
        else if (state.TotalRevenue >= 800m && (int)cur < 4) ns = GameStage.BrickAndMortar;
        else if (state.TotalRevenue >= 300m && (int)cur < 3) ns = GameStage.PermitsAndRegulations;
        else if (state.TotalRevenue >= 100m && (int)cur < 2) ns = GameStage.MultipleStands;
        if (ns != cur) {
            state.Stage = ns;
            if (ns == GameStage.PermitsAndRegulations && !state.Permits.Any(p => p.Type == PermitType.StreetVending))
                state.Permits.Add(new Permit { Type = PermitType.StreetVending, Cost = 0m, IsActive = true });
            return ns;
        }
        return null;
    }

    public static Weather GenerateWeather(int day)
    {
        var season = GetSeason(day);
        int baseTemp, variance;
        List<(WeatherType, double)> ww;
        if (season == Season.Spring) { baseTemp = 65; variance = 10; ww = new() { (WeatherType.Sunny, 0.35), (WeatherType.PartlyCloudy, 0.25), (WeatherType.Cloudy, 0.15), (WeatherType.Rainy, 0.20), (WeatherType.Stormy, 0.05) }; }
        else if (season == Season.Summer) { baseTemp = 85; variance = 8; ww = new() { (WeatherType.Sunny, 0.50), (WeatherType.PartlyCloudy, 0.20), (WeatherType.Cloudy, 0.10), (WeatherType.Rainy, 0.10), (WeatherType.Heatwave, 0.10) }; }
        else if (season == Season.Fall) { baseTemp = 55; variance = 12; ww = new() { (WeatherType.Sunny, 0.20), (WeatherType.PartlyCloudy, 0.25), (WeatherType.Cloudy, 0.25), (WeatherType.Rainy, 0.20), (WeatherType.Cold, 0.10) }; }
        else { baseTemp = 35; variance = 10; ww = new() { (WeatherType.Sunny, 0.15), (WeatherType.Cloudy, 0.25), (WeatherType.Cold, 0.25), (WeatherType.Snowy, 0.20), (WeatherType.Rainy, 0.10), (WeatherType.Stormy, 0.05) }; }

        int temp = baseTemp + Rng.Next(-variance, variance + 1);
        WeatherType wt;
        if (Rng.NextDouble() < 0.05) {
            if (season == Season.Summer) { wt = WeatherType.Heatwave; temp += 15; }
            else if (season == Season.Fall) { wt = WeatherType.Hurricane; temp -= 15; }
            else { wt = WeatherType.Stormy; temp -= 15; }
        } else {
            double roll = Rng.NextDouble(); double cum = 0; wt = WeatherType.Sunny;
            foreach (var (t, w) in ww) { cum += w; if (roll <= cum) { wt = t; break; } }
        }

        double dm;
        if (wt == WeatherType.Sunny) dm = 1.3; else if (wt == WeatherType.PartlyCloudy) dm = 1.1;
        else if (wt == WeatherType.Cloudy) dm = 0.9; else if (wt == WeatherType.Rainy) dm = 0.5;
        else if (wt == WeatherType.Stormy) dm = 0.2; else if (wt == WeatherType.Heatwave) dm = 1.8;
        else if (wt == WeatherType.Cold) dm = 0.4; else if (wt == WeatherType.Snowy) dm = 0.3;
        else if (wt == WeatherType.Hurricane) dm = 0.05; else dm = 1.0;

        if (temp > 90) dm *= 1.3; else if (temp > 80) dm *= 1.15; else if (temp > 70) dm *= 1.0;
        else if (temp > 60) dm *= 0.8; else if (temp > 50) dm *= 0.6; else dm *= 0.3;

        return new Weather { Type = wt, Temperature = temp, Season = season, DemandMultiplier = dm };
    }

    public static GameEvent? GenerateEvent(GameState state)
    {
        double chance = 0.05 + state.Stands.Count * 0.01;
        if (Rng.NextDouble() > chance) return null;
        if (state.ActiveEvents.Count(e => e.IsActive) >= 3) return null;
        var evts = new List<GameEvent> {
            new GameEvent { Type = EventType.Festival, Title = "Street Festival!", Description = "Extra foot traffic from a local festival.", Duration = 3, ImpactMultiplier = 1.5 },
            new GameEvent { Type = EventType.ViralMoment, Title = "Viral on Social Media!", Description = "Your lemonade went viral!", Duration = 2, ImpactMultiplier = 2.0 },
            new GameEvent { Type = EventType.Competitor, Title = "New Competitor", Description = "A rival stand opened nearby.", Duration = 5, ImpactMultiplier = 0.7 },
            new GameEvent { Type = EventType.HealthInspection, Title = "Health Inspection!", Description = "Inspector is visiting!", Duration = 1, ImpactMultiplier = state.Reputation >= 3.5 ? 1.1 : 0.6 },
            new GameEvent { Type = EventType.SupplyShortage, Title = "Lemon Shortage", Description = "Supply chain issues raised prices!", Duration = 4, ImpactMultiplier = 1.0 },
            new GameEvent { Type = EventType.CelebrityEndorsement, Title = "Celebrity Spotted!", Description = "A celeb was seen drinking your lemonade!", Duration = 3, ImpactMultiplier = 1.8 },
            new GameEvent { Type = EventType.EconomicBoom, Title = "Economic Boom", Description = "Economy is booming!", Duration = 7, ImpactMultiplier = 1.3 },
            new GameEvent { Type = EventType.EconomicRecession, Title = "Economic Downturn", Description = "People are tightening wallets.", Duration = 5, ImpactMultiplier = 0.7 },
            new GameEvent { Type = EventType.FoodTrend, Title = "Lemonade Trending!", Description = "Lemonade is the hot trend!", Duration = 4, ImpactMultiplier = 1.6 },
            new GameEvent { Type = EventType.PriceWar, Title = "Price War!", Description = "Competitors slashing prices.", Duration = 3, ImpactMultiplier = 0.8 },
            new GameEvent { Type = EventType.NaturalDisaster, Title = "Severe Weather", Description = "Bad weather keeping customers away.", Duration = 2, ImpactMultiplier = 0.3 },
        };
        var active = state.ActiveEvents.Where(e => e.IsActive).Select(e => e.Type).ToHashSet();
        var avail = evts.Where(e => !active.Contains(e.Type)).ToList();
        if (avail.Count == 0) return null;
        return avail[Rng.Next(avail.Count)];
    }

    public static List<Achievement> GetAchievementDefinitions()
    {
        return new List<Achievement> {
            new Achievement { Name = "First Sale", Description = "Sell your first cup", Category = AchievementCategory.Sales, Icon = "cup" },
            new Achievement { Name = "Getting Started", Description = "Sell 10 cups total", Category = AchievementCategory.Sales, Icon = "cup" },
            new Achievement { Name = "Cup by Cup", Description = "Sell 50 cups total", Category = AchievementCategory.Sales, Icon = "cup" },
            new Achievement { Name = "Centurion", Description = "Sell 100 cups total", Category = AchievementCategory.Sales, Icon = "medal" },
            new Achievement { Name = "Cup Master", Description = "Sell 500 cups total", Category = AchievementCategory.Sales, Icon = "star" },
            new Achievement { Name = "Lemonade Legend", Description = "Sell 1000 cups total", Category = AchievementCategory.Sales, Icon = "crown" },
            new Achievement { Name = "Mass Producer", Description = "Sell 5000 cups total", Category = AchievementCategory.Sales, Icon = "factory" },
            new Achievement { Name = "Lemon Empire", Description = "Sell 10000 cups total", Category = AchievementCategory.Sales, Icon = "globe" },
            new Achievement { Name = "First Dollar", Description = "Earn your first dollar", Category = AchievementCategory.Revenue, Icon = "dollar" },
            new Achievement { Name = "Double Digits", Description = "Earn $10 total revenue", Category = AchievementCategory.Revenue, Icon = "dollar" },
            new Achievement { Name = "Benjamin", Description = "Earn $100 total revenue", Category = AchievementCategory.Revenue, Icon = "money" },
            new Achievement { Name = "Thousandaire", Description = "Earn $1000 total revenue", Category = AchievementCategory.Revenue, Icon = "money-bag" },
            new Achievement { Name = "Five Grand", Description = "Earn $5000 total revenue", Category = AchievementCategory.Revenue, Icon = "diamond" },
            new Achievement { Name = "Big Bucks", Description = "Earn $10000 total revenue", Category = AchievementCategory.Revenue, Icon = "gem" },
            new Achievement { Name = "Mogul", Description = "Earn $50000 total revenue", Category = AchievementCategory.Revenue, Icon = "trophy" },
            new Achievement { Name = "Tycoon", Description = "Earn $100000 total revenue", Category = AchievementCategory.Revenue, Icon = "crown" },
            new Achievement { Name = "Branch Out", Description = "Open a second stand", Category = AchievementCategory.Expansion, Icon = "store" },
            new Achievement { Name = "Chain Reaction", Description = "Open 5 stands", Category = AchievementCategory.Expansion, Icon = "chain" },
            new Achievement { Name = "Empire Builder", Description = "Open 10 stands", Category = AchievementCategory.Expansion, Icon = "castle" },
            new Achievement { Name = "First Hire", Description = "Hire your first employee", Category = AchievementCategory.Expansion, Icon = "person" },
            new Achievement { Name = "Team Leader", Description = "Have 5 employees", Category = AchievementCategory.Expansion, Icon = "team" },
            new Achievement { Name = "Mad Scientist", Description = "Create a second recipe", Category = AchievementCategory.Recipe, Icon = "flask" },
            new Achievement { Name = "Master Chef", Description = "Recipe with quality above 90", Category = AchievementCategory.Recipe, Icon = "chef" },
            new Achievement { Name = "Perfectionist", Description = "95+ customer satisfaction", Category = AchievementCategory.Recipe, Icon = "sparkle" },
            new Achievement { Name = "Good Reputation", Description = "Reach reputation 4.0", Category = AchievementCategory.Reputation, Icon = "thumbs-up" },
            new Achievement { Name = "Famous", Description = "Reach reputation 4.5", Category = AchievementCategory.Reputation, Icon = "star" },
            new Achievement { Name = "Legendary", Description = "Reach max reputation 5.0", Category = AchievementCategory.Reputation, Icon = "crown" },
            new Achievement { Name = "Survivor", Description = "Survive 7 days", Category = AchievementCategory.Survival, Icon = "shield" },
            new Achievement { Name = "Endurance", Description = "Survive 30 days", Category = AchievementCategory.Survival, Icon = "shield" },
            new Achievement { Name = "Veteran", Description = "Survive 100 days", Category = AchievementCategory.Survival, Icon = "medal" },
            new Achievement { Name = "Marathon", Description = "Survive 365 days", Category = AchievementCategory.Survival, Icon = "trophy" },
            new Achievement { Name = "Weathering the Storm", Description = "Sell during a storm", Category = AchievementCategory.Special, Icon = "lightning" },
            new Achievement { Name = "Heatwave Hero", Description = "Sell 50+ cups in heatwave", Category = AchievementCategory.Special, Icon = "fire" },
            new Achievement { Name = "Penny Pincher", Description = "Have $500+ cash", Category = AchievementCategory.Special, Icon = "piggy-bank" },
            new Achievement { Name = "Deep Pockets", Description = "Have $5000+ cash", Category = AchievementCategory.Special, Icon = "vault" },
        };
    }

    private static List<Achievement> CheckAchievements(GameState state)
    {
        var unlocked = new List<Achievement>();
        foreach (var a in state.Achievements.Where(x => !x.IsUnlocked))
        {
            bool u = false;
            if (a.Name == "First Sale") u = state.CupsSold >= 1;
            else if (a.Name == "Getting Started") u = state.CupsSold >= 10;
            else if (a.Name == "Cup by Cup") u = state.CupsSold >= 50;
            else if (a.Name == "Centurion") u = state.CupsSold >= 100;
            else if (a.Name == "Cup Master") u = state.CupsSold >= 500;
            else if (a.Name == "Lemonade Legend") u = state.CupsSold >= 1000;
            else if (a.Name == "Mass Producer") u = state.CupsSold >= 5000;
            else if (a.Name == "Lemon Empire") u = state.CupsSold >= 10000;
            else if (a.Name == "First Dollar") u = state.TotalRevenue >= 1m;
            else if (a.Name == "Double Digits") u = state.TotalRevenue >= 10m;
            else if (a.Name == "Benjamin") u = state.TotalRevenue >= 100m;
            else if (a.Name == "Thousandaire") u = state.TotalRevenue >= 1000m;
            else if (a.Name == "Five Grand") u = state.TotalRevenue >= 5000m;
            else if (a.Name == "Big Bucks") u = state.TotalRevenue >= 10000m;
            else if (a.Name == "Mogul") u = state.TotalRevenue >= 50000m;
            else if (a.Name == "Tycoon") u = state.TotalRevenue >= 100000m;
            else if (a.Name == "Branch Out") u = state.Stands.Count >= 2;
            else if (a.Name == "Chain Reaction") u = state.Stands.Count >= 5;
            else if (a.Name == "Empire Builder") u = state.Stands.Count >= 10;
            else if (a.Name == "First Hire") u = state.Employees.Count >= 1;
            else if (a.Name == "Team Leader") u = state.Employees.Count >= 5;
            else if (a.Name == "Mad Scientist") u = state.Recipes.Count >= 2;
            else if (a.Name == "Master Chef") u = state.Recipes.Any(r => r.GetQualityScore(WeatherType.Sunny, 80) > 90);
            else if (a.Name == "Perfectionist") u = state.DayHistory.Count > 0 && state.DayHistory[state.DayHistory.Count - 1].CustomerSatisfaction >= 95;
            else if (a.Name == "Good Reputation") u = state.Reputation >= 4.0;
            else if (a.Name == "Famous") u = state.Reputation >= 4.5;
            else if (a.Name == "Legendary") u = state.Reputation >= 4.95;
            else if (a.Name == "Survivor") u = state.Day >= 7;
            else if (a.Name == "Endurance") u = state.Day >= 30;
            else if (a.Name == "Veteran") u = state.Day >= 100;
            else if (a.Name == "Marathon") u = state.Day >= 365;
            else if (a.Name == "Weathering the Storm") u = state.DayHistory.Count > 0 && state.DayHistory[state.DayHistory.Count - 1].Weather == WeatherType.Stormy && state.DayHistory[state.DayHistory.Count - 1].CupsSold > 0;
            else if (a.Name == "Heatwave Hero") u = state.DayHistory.Count > 0 && state.DayHistory[state.DayHistory.Count - 1].Weather == WeatherType.Heatwave && state.DayHistory[state.DayHistory.Count - 1].CupsSold >= 50;
            else if (a.Name == "Penny Pincher") u = state.Cash >= 500m;
            else if (a.Name == "Deep Pockets") u = state.Cash >= 5000m;
            if (u) { a.IsUnlocked = true; a.UnlockedAt = DateTime.UtcNow; unlocked.Add(a); }
        }
        return unlocked;
    }

    private static void ProcessActiveEvents(GameState state)
    {
        foreach (var e in state.ActiveEvents) { if (e.IsActive) { e.Duration--; if (e.Duration <= 0) e.IsActive = false; } }
        var inactive = state.ActiveEvents.Where(e => !e.IsActive).ToList();
        if (inactive.Count > 10) state.ActiveEvents = state.ActiveEvents.Where(e => e.IsActive).Concat(inactive.Skip(inactive.Count - 10)).ToList();
    }

    private static int GetMaxStands(GameStage s)
    {
        if (s == GameStage.NeighborhoodStand) return 1; if (s == GameStage.MultipleStands) return 3;
        if (s == GameStage.PermitsAndRegulations) return 5; if (s == GameStage.BrickAndMortar) return 8;
        if (s == GameStage.MultiStoreChain) return 12; if (s == GameStage.FranchiseModel) return 20;
        if (s == GameStage.StateExpansion) return 30; if (s == GameStage.NationalChain) return 50;
        if (s == GameStage.InternationalEmpire) return 75; if (s == GameStage.GlobalDomination) return 100;
        return 1;
    }

    private static decimal GetBaseWage(EmployeeRole r)
    {
        if (r == EmployeeRole.Cashier) return 8m; if (r == EmployeeRole.Cook) return 10m;
        if (r == EmployeeRole.Manager) return 15m; if (r == EmployeeRole.Marketer) return 12m;
        if (r == EmployeeRole.Accountant) return 14m; return 8m;
    }

    private static Season GetSeason(int day)
    {
        int s = (day - 1) % 120;
        if (s < 30) return Season.Spring; if (s < 60) return Season.Summer;
        if (s < 90) return Season.Fall; return Season.Winter;
    }

    private static string GenName()
    {
        string[] f = { "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Quinn", "Avery", "Parker", "Skyler", "Jamie", "Sam", "Drew", "Blake", "Reese" };
        string[] l = { "Smith", "Johnson", "Lee", "Garcia", "Martinez", "Brown", "Davis", "Wilson", "Anderson", "Thomas", "Jackson", "White", "Harris", "Clark", "Lewis" };
        return f[Rng.Next(f.Length)] + " " + l[Rng.Next(l.Length)];
    }

    public static CityEvent? GenerateCityEvent(GameState state)
    {
        if (Rng.NextDouble() > 0.12) return null;
        if (state.CityEvents.Count(e => e.IsActive) >= 3) return null;

        var events = new List<CityEvent>
        {
            new CityEvent { Title = "Big Game Day!", Description = "A major game at the stadium is drawing huge crowds.", AffectedLocationType = LocationType.SportVenue, TrafficMultiplier = 2.0, Duration = 2 },
            new CityEvent { Title = "Concert in the Park", Description = "A popular band is playing in the park.", AffectedLocationType = LocationType.Park, TrafficMultiplier = 1.8, Duration = 2 },
            new CityEvent { Title = "Back to School Week", Description = "School is back in session with lots of foot traffic.", AffectedLocationType = LocationType.School, TrafficMultiplier = 1.5, Duration = 5 },
            new CityEvent { Title = "Mall Sale Event", Description = "Big sales are bringing shoppers to the mall.", AffectedLocationType = LocationType.Mall, TrafficMultiplier = 1.6, Duration = 3 },
            new CityEvent { Title = "Downtown Street Fair", Description = "A street fair is boosting downtown foot traffic.", AffectedLocationType = LocationType.Downtown, TrafficMultiplier = 1.5, Duration = 2 },
            new CityEvent { Title = "Neighborhood Block Party", Description = "The whole neighborhood is celebrating!", AffectedLocationType = LocationType.Residential, TrafficMultiplier = 2.0, Duration = 1 },
            new CityEvent { Title = "Beach Festival", Description = "Summer vibes and beach crowds!", AffectedLocationType = LocationType.Beach, TrafficMultiplier = 1.8, Duration = 3 },
            new CityEvent { Title = "Highway Construction", Description = "Road work is reducing highway traffic.", AffectedLocationType = LocationType.Highway, TrafficMultiplier = 0.5, Duration = 3 },
            new CityEvent { Title = "School Holiday", Description = "No school today means fewer kids around.", AffectedLocationType = LocationType.School, TrafficMultiplier = 0.3, Duration = 2 },
            new CityEvent { Title = "Suburban Farmers Market", Description = "A farmers market is bringing people to the suburbs.", AffectedLocationType = LocationType.SuburbanStrip, TrafficMultiplier = 1.7, Duration = 2 },
            new CityEvent { Title = "Stadium Concert", Description = "A massive concert at the stadium!", AffectedLocationType = LocationType.SportVenue, TrafficMultiplier = 2.5, Duration = 1 },
            new CityEvent { Title = "Mall Renovation", Description = "Part of the mall is under renovation.", AffectedLocationType = LocationType.Mall, TrafficMultiplier = 0.6, Duration = 4 },
        };

        var activeTypes = state.CityEvents.Where(e => e.IsActive).Select(e => e.AffectedLocationType).ToHashSet();
        var available = events.Where(e => !activeTypes.Contains(e.AffectedLocationType)).ToList();
        if (available.Count == 0) return null;
        return available[Rng.Next(available.Count)];
    }

    private static void ProcessCityEvents(GameState state)
    {
        foreach (var e in state.CityEvents)
        {
            if (e.IsActive) { e.Duration--; if (e.Duration <= 0) e.IsActive = false; }
        }
        state.CityEvents = state.CityEvents.Where(e => e.IsActive).ToList();
    }

    private static double GetCityEventMultiplier(GameState state, LocationType locationType)
    {
        double mult = 1.0;
        foreach (var evt in state.CityEvents.Where(e => e.IsActive && e.AffectedLocationType == locationType))
            mult *= evt.TrafficMultiplier;
        return mult;
    }

    private static void UpdateCompetitorStrength(GameState state, DayResult result)
    {
        foreach (var evt in state.ActiveEvents.Where(e => e.IsActive && e.Type == EventType.Competitor))
        {
            // Fix legacy saves where CompetitorStrength defaulted to 0
            if (evt.CompetitorStrength <= 0) evt.CompetitorStrength = 1.0;

            // Check if player is fighting back with quality and competitive pricing
            double avgQuality = 0;
            double avgPrice = 0;
            int standCount = 0;
            foreach (var stand in state.Stands.Where(s => s.IsOpen))
            {
                var recipe = state.Recipes.FirstOrDefault(r => r.Id == stand.RecipeId);
                if (recipe != null)
                {
                    avgQuality += recipe.GetQualityScore(WeatherType.Sunny, 75);
                    avgPrice += (double)stand.PricePerCup;
                    standCount++;
                }
            }
            if (standCount > 0)
            {
                avgQuality /= standCount;
                avgPrice /= standCount;
            }

            // Good quality (>60) and competitive price (<$2.50) weakens competitor
            if (avgQuality > 60 && avgPrice < 2.50)
            {
                double reduction = 0.15;
                if (avgQuality > 80) reduction += 0.05;
                if (avgPrice < 1.50) reduction += 0.05;
                evt.CompetitorStrength = Math.Max(0, evt.CompetitorStrength - reduction);
                if (evt.CompetitorStrength > 0.3)
                    result.Notifications.Add("Your quality and pricing are pressuring the competitor!");
                else if (evt.CompetitorStrength > 0)
                    result.Notifications.Add("The competitor is struggling against your stand!");
            }

            if (evt.CompetitorStrength <= 0)
            {
                evt.IsActive = false;
                result.Notifications.Add("You drove the competitor out of business!");
                result.Events.Add("Competitor Defeated: Your superior lemonade wins!");
            }
        }
    }
}
