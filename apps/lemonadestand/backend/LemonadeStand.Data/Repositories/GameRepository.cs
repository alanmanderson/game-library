using System.Text.Json;
using LemonadeStand.Core.Models;
using LemonadeStand.Data.Context;
using Microsoft.EntityFrameworkCore;

namespace LemonadeStand.Data.Repositories;

public class GameRepository
{
    private readonly GameDbContext _db;
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public GameRepository(GameDbContext db) => _db = db;

    public async Task<GameState?> LoadGameAsync(Guid id)
    {
        var entity = await _db.GameSaves.FindAsync(id.ToString());
        if (entity == null) return null;
        return JsonSerializer.Deserialize<GameState>(entity.JsonData, JsonOpts);
    }

    public async Task SaveGameAsync(GameState state)
    {
        var json = JsonSerializer.Serialize(state, JsonOpts);
        var existing = await _db.GameSaves.FindAsync(state.Id.ToString());
        if (existing != null)
        {
            existing.PlayerName = state.PlayerName;
            existing.Day = state.Day;
            existing.Cash = state.Cash;
            existing.Stage = state.Stage.ToString();
            existing.IsGameOver = state.IsGameOver;
            existing.JsonData = json;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            _db.GameSaves.Add(new GameSaveEntity
            {
                Id = state.Id.ToString(),
                PlayerName = state.PlayerName,
                Day = state.Day,
                Cash = state.Cash,
                Stage = state.Stage.ToString(),
                IsGameOver = state.IsGameOver,
                JsonData = json,
                CreatedAt = state.CreatedAt,
                UpdatedAt = DateTime.UtcNow
            });
        }
        await _db.SaveChangesAsync();
    }

    public async Task<List<GameSaveEntity>> ListGamesAsync()
    {
        return await _db.GameSaves.OrderByDescending(g => g.UpdatedAt).ToListAsync();
    }

    public async Task<bool> DeleteGameAsync(Guid id)
    {
        var entity = await _db.GameSaves.FindAsync(id.ToString());
        if (entity == null) return false;
        _db.GameSaves.Remove(entity);
        await _db.SaveChangesAsync();
        return true;
    }
}
