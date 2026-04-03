using LemonadeStand.Api.DTOs;
using LemonadeStand.Core.Engine;
using LemonadeStand.Core.Enums;
using LemonadeStand.Data.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace LemonadeStand.Api.Controllers;

[ApiController]
[Route("api/game")]
public class GameController : ControllerBase
{
    private readonly GameRepository _repo;

    public GameController(GameRepository repo)
    {
        _repo = repo;
    }

    [HttpPost("new")]
    public async Task<ActionResult<GameStateResponse>> NewGame([FromBody] NewGameRequest request)
    {
        var gameState = GameEngine.NewGame(request.PlayerName);
        await _repo.SaveGameAsync(gameState);
        return Ok(MapToResponse(gameState));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<GameStateResponse>> GetGame(Guid id)
    {
        var gameState = await _repo.LoadGameAsync(id);
        if (gameState == null) return NotFound(new { error = "Game not found" });
        return Ok(MapToResponse(gameState));
    }

    [HttpGet]
    public async Task<ActionResult<List<GameSaveListItem>>> ListGames()
    {
        var saves = await _repo.ListGamesAsync();
        return Ok(saves.Select(s => new GameSaveListItem
        {
            Id = Guid.Parse(s.Id),
            PlayerName = s.PlayerName,
            Day = s.Day,
            Cash = s.Cash,
            Stage = s.Stage,
            IsGameOver = s.IsGameOver,
            CreatedAt = s.CreatedAt,
            UpdatedAt = s.UpdatedAt,
        }).ToList());
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> DeleteGame(Guid id)
    {
        var deleted = await _repo.DeleteGameAsync(id);
        if (!deleted) return NotFound(new { error = "Game not found" });
        return NoContent();
    }

    [HttpPost("{id:guid}/advance-day")]
    public async Task<ActionResult<DayResultResponse>> AdvanceDay(Guid id)
    {
        var gameState = await _repo.LoadGameAsync(id);
        if (gameState == null) return NotFound(new { error = "Game not found" });
        if (gameState.IsGameOver) return BadRequest(new { error = "Game is over" });

        var result = GameEngine.AdvanceDay(gameState);
        await _repo.SaveGameAsync(gameState);
        return Ok(MapDayResult(result));
    }

    [HttpPost("{id:guid}/buy-supplies")]
    public async Task<ActionResult<GameStateResponse>> BuySupplies(Guid id, [FromBody] BuySuppliesRequest request)
    {
        var gameState = await _repo.LoadGameAsync(id);
        if (gameState == null) return NotFound(new { error = "Game not found" });

        bool ok = GameEngine.BuySupplies(gameState, request.Cups, request.Lemons, request.Sugar, request.Ice, request.Water);
        if (!ok) return BadRequest(new { error = "Not enough cash" });

        await _repo.SaveGameAsync(gameState);
        return Ok(MapToResponse(gameState));
    }

    [HttpPost("{id:guid}/set-recipe")]
    public async Task<ActionResult<GameStateResponse>> SetRecipe(Guid id, [FromBody] SetRecipeRequest request)
    {
        var gameState = await _repo.LoadGameAsync(id);
        if (gameState == null) return NotFound(new { error = "Game not found" });

        var stand = gameState.Stands.FirstOrDefault(s => s.Id == request.StandId);
        if (stand == null) return BadRequest(new { error = "Stand not found" });

        var recipe = gameState.Recipes.FirstOrDefault(r => r.Id == stand.RecipeId);
        if (recipe == null)
        {
            recipe = new LemonadeStand.Core.Models.Recipe { Id = Guid.NewGuid() };
            gameState.Recipes.Add(recipe);
            stand.RecipeId = recipe.Id;
        }
        recipe.WaterRatio = request.WaterRatio;
        recipe.LemonRatio = request.LemonRatio;
        recipe.SugarRatio = request.SugarRatio;
        recipe.IceRatio = request.IceRatio;

        await _repo.SaveGameAsync(gameState);
        return Ok(MapToResponse(gameState));
    }

    [HttpPost("{id:guid}/set-price")]
    public async Task<ActionResult<GameStateResponse>> SetPrice(Guid id, [FromBody] SetPriceRequest request)
    {
        var gameState = await _repo.LoadGameAsync(id);
        if (gameState == null) return NotFound(new { error = "Game not found" });

        var stand = gameState.Stands.FirstOrDefault(s => s.Id == request.StandId);
        if (stand == null) return BadRequest(new { error = "Stand not found" });

        stand.PricePerCup = request.Price;
        await _repo.SaveGameAsync(gameState);
        return Ok(MapToResponse(gameState));
    }

    [HttpPost("{id:guid}/open-stand")]
    public async Task<ActionResult<GameStateResponse>> OpenStand(Guid id, [FromBody] OpenStandRequest request)
    {
        var gameState = await _repo.LoadGameAsync(id);
        if (gameState == null) return NotFound(new { error = "Game not found" });

        if (!Enum.TryParse<LocationType>(request.LocationType, true, out var locType))
            locType = LocationType.Residential;

        var stand = GameEngine.OpenNewStand(gameState, request.LocationName, locType);
        if (stand == null) return BadRequest(new { error = "Cannot open stand here" });

        await _repo.SaveGameAsync(gameState);
        return Ok(MapToResponse(gameState));
    }

    [HttpPost("{id:guid}/hire-employee")]
    public async Task<ActionResult<GameStateResponse>> HireEmployee(Guid id, [FromBody] HireEmployeeRequest request)
    {
        var gameState = await _repo.LoadGameAsync(id);
        if (gameState == null) return NotFound(new { error = "Game not found" });

        if (!Enum.TryParse<EmployeeRole>(request.Role, true, out var role))
            role = EmployeeRole.Cashier;

        GameEngine.HireEmployee(gameState, request.Name, role);
        await _repo.SaveGameAsync(gameState);
        return Ok(MapToResponse(gameState));
    }

    [HttpGet("{id:guid}/locations")]
    public async Task<ActionResult> GetLocations(Guid id)
    {
        var gameState = await _repo.LoadGameAsync(id);
        if (gameState == null) return NotFound(new { error = "Game not found" });

        var locations = GameEngine.GetAvailableLocations(gameState);
        return Ok(locations.Select(l => new
        {
            l.Name,
            type = l.Type.ToString(),
            l.FootTraffic,
            dailyRent = l.Rent,
            l.RequiresPermit,
            buildCost = l.BuildCost,
            description = $"{l.Type} area with ~{l.FootTraffic} daily foot traffic"
        }));
    }

    [HttpGet("{id:guid}/prices")]
    public async Task<ActionResult> GetPrices(Guid id)
    {
        var gameState = await _repo.LoadGameAsync(id);
        if (gameState == null) return NotFound(new { error = "Game not found" });

        var prices = GameEngine.GetSupplyPrices(gameState);
        return Ok(new
        {
            cupsPerPack = prices.CupsPer50Pack,
            lemonsPerPound = prices.LemonsPerLb,
            sugarPerPound = prices.SugarPerLb,
            icePerPound = prices.IcePerLb,
            waterPerGallon = prices.WaterPerGallon,
            cupsPerPack_Count = 50
        });
    }

    private static GameStateResponse MapToResponse(LemonadeStand.Core.Models.GameState s) => new()
    {
        Id = s.Id, PlayerName = s.PlayerName, Cash = Math.Round(s.Cash, 2),
        TotalRevenue = Math.Round(s.TotalRevenue, 2), TotalExpenses = Math.Round(s.TotalExpenses, 2),
        Day = s.Day, Stage = s.Stage.ToString(), Reputation = Math.Round(s.Reputation, 2),
        CustomersServed = s.CustomersServed, CupsSold = s.CupsSold,
        IsGameOver = s.IsGameOver, GameOverReason = s.GameOverReason,
        CreatedAt = s.CreatedAt, UpdatedAt = s.UpdatedAt,
        Inventory = new InventoryResponse
        {
            Cups = s.Inventory.Cups,
            Lemons = Math.Round(s.Inventory.Lemons, 2),
            Sugar = Math.Round(s.Inventory.Sugar, 2),
            Ice = Math.Round(s.Inventory.Ice, 2),
            Water = Math.Round(s.Inventory.Water, 2),
        },
        Stands = s.Stands.Select(st => new StandResponse
        {
            Id = st.Id, Name = st.Name, LocationType = st.LocationType.ToString(),
            LocationName = st.LocationName, FootTraffic = st.FootTraffic, Rent = st.Rent,
            HasPermit = st.HasPermit, IsOpen = st.IsOpen, Level = st.Level,
            PricePerCup = st.PricePerCup, RecipeId = st.RecipeId,
        }).ToList(),
        Recipes = s.Recipes.Select(r => new RecipeResponse
        {
            Id = r.Id, Name = r.Name, WaterRatio = r.WaterRatio,
            LemonRatio = r.LemonRatio, SugarRatio = r.SugarRatio, IceRatio = r.IceRatio,
        }).ToList(),
        Employees = s.Employees.Select(e => new EmployeeResponse
        {
            Id = e.Id, Name = e.Name, Role = e.Role.ToString(), Wage = e.Wage,
            Skill = e.Skill, Satisfaction = e.Satisfaction, DaysEmployed = e.DaysEmployed,
        }).ToList(),
        Achievements = s.Achievements.Select(a => new AchievementResponse
        {
            Id = a.Id, Name = a.Name, Description = a.Description,
            Category = a.Category.ToString(), IsUnlocked = a.IsUnlocked,
            Icon = a.Icon, UnlockedAt = a.UnlockedAt,
        }).ToList(),
        ActiveEvents = s.ActiveEvents.Where(e => e.IsActive).Select(e => new EventResponse
        {
            Type = e.Type.ToString(), Title = e.Title, Description = e.Description,
            Duration = e.Duration, ImpactMultiplier = e.ImpactMultiplier, IsActive = e.IsActive,
        }).ToList(),
        Permits = s.Permits.Select(p => new PermitResponse
        {
            Type = p.Type.ToString(), Cost = p.Cost, IsActive = p.IsActive,
        }).ToList(),
        CityEvents = s.CityEvents.Where(e => e.IsActive).Select(e => new CityEventResponse
        {
            Title = e.Title, Description = e.Description,
            AffectedLocationType = e.AffectedLocationType.ToString(),
            TrafficMultiplier = e.TrafficMultiplier, Duration = e.Duration, IsActive = e.IsActive,
        }).ToList(),
    };

    private static DayResultResponse MapDayResult(LemonadeStand.Core.Models.DayResult r) => new()
    {
        Day = r.Day, Revenue = Math.Round(r.Revenue, 2), Expenses = Math.Round(r.Expenses, 2),
        Profit = Math.Round(r.Profit, 2), CustomerCount = r.CustomerCount, CupsSold = r.CupsSold,
        CustomerSatisfaction = Math.Round(r.CustomerSatisfaction, 1),
        Weather = r.Weather.ToString(), Temperature = r.Temperature, Season = r.Season.ToString(),
        Events = r.Events, Notifications = r.Notifications,
        NewAchievements = r.NewAchievements.Select(a => new AchievementResponse
        {
            Id = a.Id, Name = a.Name, Description = a.Description,
            Category = a.Category.ToString(), IsUnlocked = a.IsUnlocked, Icon = a.Icon, UnlockedAt = a.UnlockedAt,
        }).ToList(),
        InventoryRanOut = r.InventoryRanOut, CashAfter = Math.Round(r.CashAfter, 2),
        NewStageReached = r.NewStageReached?.ToString(),
    };
}
