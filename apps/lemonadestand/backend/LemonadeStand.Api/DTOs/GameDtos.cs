namespace LemonadeStand.Api.DTOs;

// Request DTOs
public record NewGameRequest(string PlayerName);

public record BuySuppliesRequest(int Cups, double Lemons, double Sugar, double Ice, double Water);

public record SetRecipeRequest(Guid StandId, double WaterRatio, double LemonRatio, double SugarRatio, double IceRatio);

public record SetPriceRequest(Guid StandId, decimal Price);

public record OpenStandRequest(string LocationName, string LocationType);

public record HireEmployeeRequest(string Name, string Role);

// Response DTOs
public class GameStateResponse
{
    public Guid Id { get; set; }
    public string PlayerName { get; set; } = "";
    public decimal Cash { get; set; }
    public decimal TotalRevenue { get; set; }
    public decimal TotalExpenses { get; set; }
    public int Day { get; set; }
    public string Stage { get; set; } = "";
    public double Reputation { get; set; }
    public int CustomersServed { get; set; }
    public int CupsSold { get; set; }
    public bool IsGameOver { get; set; }
    public string? GameOverReason { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public InventoryResponse Inventory { get; set; } = new();
    public List<StandResponse> Stands { get; set; } = new();
    public List<RecipeResponse> Recipes { get; set; } = new();
    public List<EmployeeResponse> Employees { get; set; } = new();
    public List<AchievementResponse> Achievements { get; set; } = new();
    public List<EventResponse> ActiveEvents { get; set; } = new();
    public List<PermitResponse> Permits { get; set; } = new();
    public List<CityEventResponse> CityEvents { get; set; } = new();
}

public class DayResultResponse
{
    public int Day { get; set; }
    public decimal Revenue { get; set; }
    public decimal Expenses { get; set; }
    public decimal Profit { get; set; }
    public int CustomerCount { get; set; }
    public int CupsSold { get; set; }
    public double CustomerSatisfaction { get; set; }
    public string Weather { get; set; } = "";
    public int Temperature { get; set; }
    public string Season { get; set; } = "";
    public List<string> Events { get; set; } = new();
    public List<string> Notifications { get; set; } = new();
    public List<AchievementResponse> NewAchievements { get; set; } = new();
    public bool InventoryRanOut { get; set; }
    public decimal CashAfter { get; set; }
    public string? NewStageReached { get; set; }
}

public class GameSaveListItem
{
    public Guid Id { get; set; }
    public string PlayerName { get; set; } = "";
    public int Day { get; set; }
    public decimal Cash { get; set; }
    public string Stage { get; set; } = "";
    public bool IsGameOver { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class InventoryResponse
{
    public int Cups { get; set; }
    public double Lemons { get; set; }
    public double Sugar { get; set; }
    public double Ice { get; set; }
    public double Water { get; set; }
}

public class StandResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string LocationType { get; set; } = "";
    public string LocationName { get; set; } = "";
    public int FootTraffic { get; set; }
    public decimal Rent { get; set; }
    public bool HasPermit { get; set; }
    public bool IsOpen { get; set; }
    public int Level { get; set; }
    public decimal PricePerCup { get; set; }
    public Guid? RecipeId { get; set; }
}

public class RecipeResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public double WaterRatio { get; set; }
    public double LemonRatio { get; set; }
    public double SugarRatio { get; set; }
    public double IceRatio { get; set; }
}

public class EmployeeResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Role { get; set; } = "";
    public decimal Wage { get; set; }
    public int Skill { get; set; }
    public int Satisfaction { get; set; }
    public int DaysEmployed { get; set; }
}

public class AchievementResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Category { get; set; } = "";
    public bool IsUnlocked { get; set; }
    public string Icon { get; set; } = "";
    public DateTime? UnlockedAt { get; set; }
}

public class EventResponse
{
    public string Type { get; set; } = "";
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public int Duration { get; set; }
    public double ImpactMultiplier { get; set; }
    public bool IsActive { get; set; }
}

public class PermitResponse
{
    public string Type { get; set; } = "";
    public decimal Cost { get; set; }
    public bool IsActive { get; set; }
}

public class CityEventResponse
{
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string AffectedLocationType { get; set; } = "";
    public double TrafficMultiplier { get; set; }
    public int Duration { get; set; }
    public bool IsActive { get; set; }
}
