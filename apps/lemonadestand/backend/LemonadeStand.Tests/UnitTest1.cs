using LemonadeStand.Core.Engine;
using LemonadeStand.Core.Models;

namespace LemonadeStand.Tests;

public class GameEngineTests
{
    [Fact]
    public void NewGame_CreatesValidGameState()
    {
        var state = GameEngine.NewGame("TestPlayer");

        Assert.NotNull(state);
        Assert.Equal("TestPlayer", state.PlayerName);
        Assert.Equal(50.00m, state.Cash);
        Assert.Equal(1, state.Day);
        Assert.Single(state.Stands);
        Assert.Single(state.Recipes);
        Assert.True(state.Inventory.Cups > 0);
        Assert.True(state.Inventory.Lemons > 0);
        Assert.False(state.IsGameOver);
    }

    [Fact]
    public void AdvanceDay_SimulatesOneDay()
    {
        var state = GameEngine.NewGame("TestPlayer");
        var result = GameEngine.AdvanceDay(state);

        Assert.NotNull(result);
        Assert.Equal(1, result.Day);
        Assert.Equal(2, state.Day); // Day advanced
        Assert.True(result.Temperature != 0); // Weather generated
    }

    [Fact]
    public void BuySupplies_DeductsCashAndAddsInventory()
    {
        var state = GameEngine.NewGame("TestPlayer");
        decimal cashBefore = state.Cash;
        int cupsBefore = state.Inventory.Cups;

        bool success = GameEngine.BuySupplies(state, 1, 0, 0, 0, 0); // Buy 1 pack of 50 cups

        Assert.True(success);
        Assert.Equal(cupsBefore + 50, state.Inventory.Cups);
        Assert.True(state.Cash < cashBefore);
    }

    [Fact]
    public void BuySupplies_FailsWhenNotEnoughCash()
    {
        var state = GameEngine.NewGame("TestPlayer");
        state.Cash = 0.01m;

        bool success = GameEngine.BuySupplies(state, 100, 100, 100, 100, 100);

        Assert.False(success);
    }

    [Fact]
    public void GetAvailableLocations_ReturnsLocations()
    {
        var state = GameEngine.NewGame("TestPlayer");
        var locations = GameEngine.GetAvailableLocations(state);

        Assert.NotNull(locations);
        Assert.True(locations.Count > 0);
    }

    [Fact]
    public void GetSupplyPrices_ReturnsPrices()
    {
        var state = GameEngine.NewGame("TestPlayer");
        var prices = GameEngine.GetSupplyPrices(state);

        Assert.NotNull(prices);
        Assert.True(prices.CupsPer50Pack > 0);
        Assert.True(prices.LemonsPerLb > 0);
    }

    [Fact]
    public void GetAchievementDefinitions_ReturnsAtLeast30()
    {
        var achievements = GameEngine.GetAchievementDefinitions();
        Assert.True(achievements.Count >= 30, $"Expected at least 30 achievements, got {achievements.Count}");
    }

    [Fact]
    public void Recipe_GetQualityScore_ReturnsReasonableValue()
    {
        var recipe = new Recipe
        {
            WaterRatio = 0.10,
            LemonRatio = 0.10,
            SugarRatio = 0.05,
            IceRatio = 0.10,
        };

        double score = recipe.GetQualityScore(LemonadeStand.Core.Enums.WeatherType.Sunny, 80);

        Assert.True(score > 0, "Quality score should be positive");
        Assert.True(score <= 100, "Quality score should not exceed 100");
    }

    [Fact]
    public void AdvanceDay_MultipleRuns_DoesNotCrash()
    {
        var state = GameEngine.NewGame("TestPlayer");

        // Run 10 days
        for (int i = 0; i < 10; i++)
        {
            var result = GameEngine.AdvanceDay(state);
            Assert.NotNull(result);
        }

        Assert.Equal(11, state.Day);
    }
}
