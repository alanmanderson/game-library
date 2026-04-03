using LemonadeStand.Core.Enums;

namespace LemonadeStand.Core.Models;

public class GameState
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string PlayerName { get; set; } = string.Empty;
    public decimal Cash { get; set; } = 50.00m;
    public decimal TotalRevenue { get; set; }
    public decimal TotalExpenses { get; set; }
    public int Day { get; set; } = 1;
    public GameStage Stage { get; set; } = GameStage.NeighborhoodStand;
    public double Reputation { get; set; } = 3.0;
    public int CustomersServed { get; set; }
    public int CupsSold { get; set; }
    public bool IsGameOver { get; set; }
    public string? GameOverReason { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Inventory Inventory { get; set; } = new();
    public List<Stand> Stands { get; set; } = new();
    public List<Recipe> Recipes { get; set; } = new();
    public List<Employee> Employees { get; set; } = new();
    public List<Achievement> Achievements { get; set; } = new();
    public List<DayResult> DayHistory { get; set; } = new();
    public List<GameEvent> ActiveEvents { get; set; } = new();
    public List<Permit> Permits { get; set; } = new();
    public List<CityEvent> CityEvents { get; set; } = new();
}

public class Inventory
{
    public int Cups { get; set; }
    public double Lemons { get; set; }
    public double Sugar { get; set; }
    public double Ice { get; set; }
    public double Water { get; set; }
}

public class Stand
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "My Stand";
    public LocationType LocationType { get; set; } = LocationType.Residential;
    public string LocationName { get; set; } = "Home Street";
    public int FootTraffic { get; set; } = 50;
    public decimal Rent { get; set; }
    public bool HasPermit { get; set; }
    public bool IsOpen { get; set; } = true;
    public int Level { get; set; } = 1;
    public decimal PricePerCup { get; set; } = 1.00m;
    public Guid? RecipeId { get; set; }
}

public class Recipe
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "Classic Lemonade";
    public double WaterRatio { get; set; } = 0.10;
    public double LemonRatio { get; set; } = 0.10;
    public double SugarRatio { get; set; } = 0.05;
    public double IceRatio { get; set; } = 0.10;

    public double GetQualityScore(WeatherType weather, int temperatureF)
    {
        double lemonScore = Math.Min(LemonRatio / 0.10, 1.0) * 30;
        double sugarScore = Math.Min(SugarRatio / 0.05, 1.0) * 20;
        double waterScore = Math.Min(WaterRatio / 0.10, 1.0) * 15;
        double iceScore = Math.Min(IceRatio / 0.10, 1.0) * 15;

        double baseQuality = lemonScore + sugarScore + waterScore + iceScore;

        if (WaterRatio > 0.20) baseQuality -= (WaterRatio - 0.20) * 100;
        if (SugarRatio > 0.10) baseQuality -= (SugarRatio - 0.10) * 80;
        if (LemonRatio > 0.20) baseQuality -= (LemonRatio - 0.20) * 60;

        double weatherBonus = 0;
        if (temperatureF > 85)
        {
            weatherBonus = Math.Min(IceRatio / 0.15, 1.0) * 20;
        }
        else if (temperatureF > 70)
        {
            weatherBonus = 15;
        }
        else if (temperatureF > 50)
        {
            weatherBonus = (SugarRatio >= 0.04 ? 10 : 5) + (IceRatio <= 0.05 ? 5 : 0);
        }
        else
        {
            weatherBonus = IceRatio <= 0.03 ? 10 : 0;
        }

        if (weather == WeatherType.Sunny || weather == WeatherType.Heatwave)
            weatherBonus += 5;

        double totalScore = baseQuality + weatherBonus;
        return Math.Clamp(totalScore, 0, 100);
    }
}

public class Employee
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public EmployeeRole Role { get; set; }
    public decimal Wage { get; set; } = 8.00m;
    public int Skill { get; set; } = 50;
    public int Satisfaction { get; set; } = 75;
    public int DaysEmployed { get; set; }
}

public class Achievement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public AchievementCategory Category { get; set; }
    public bool IsUnlocked { get; set; }
    public string Icon { get; set; } = "trophy";
    public DateTime? UnlockedAt { get; set; }
}

public class DayResult
{
    public int Day { get; set; }
    public decimal Revenue { get; set; }
    public decimal Expenses { get; set; }
    public decimal Profit => Revenue - Expenses;
    public int CustomerCount { get; set; }
    public int CupsSold { get; set; }
    public double CustomerSatisfaction { get; set; }
    public WeatherType Weather { get; set; }
    public int Temperature { get; set; }
    public Season Season { get; set; }
    public List<string> Events { get; set; } = new();
    public List<string> Notifications { get; set; } = new();
    public List<Achievement> NewAchievements { get; set; } = new();
    public bool InventoryRanOut { get; set; }
    public decimal CashAfter { get; set; }
    public GameStage? NewStageReached { get; set; }
}

public class GameEvent
{
    public EventType Type { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int Duration { get; set; } = 1;
    public double ImpactMultiplier { get; set; } = 1.0;
    public bool IsActive { get; set; } = true;
    public double CompetitorStrength { get; set; } = 1.0;
}

public class Permit
{
    public PermitType Type { get; set; }
    public decimal Cost { get; set; }
    public bool IsActive { get; set; }
}

public class Weather
{
    public WeatherType Type { get; set; }
    public int Temperature { get; set; }
    public Season Season { get; set; }
    public double DemandMultiplier { get; set; } = 1.0;
}

public class SupplyPrices
{
    public decimal CupsPer50Pack { get; set; } = 2.00m;
    public decimal LemonsPerLb { get; set; } = 1.50m;
    public decimal SugarPerLb { get; set; } = 0.80m;
    public decimal IcePerLb { get; set; } = 0.50m;
    public decimal WaterPerGallon { get; set; } = 0.10m;
}

public class LocationOption
{
    public string Name { get; set; } = string.Empty;
    public LocationType Type { get; set; }
    public int FootTraffic { get; set; }
    public decimal Rent { get; set; }
    public bool RequiresPermit { get; set; }
    public decimal BuildCost { get; set; }
}

public class CityEvent
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public LocationType AffectedLocationType { get; set; }
    public double TrafficMultiplier { get; set; } = 1.0;
    public int Duration { get; set; } = 1;
    public bool IsActive { get; set; } = true;
}
