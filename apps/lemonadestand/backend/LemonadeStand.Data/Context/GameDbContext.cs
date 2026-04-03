using Microsoft.EntityFrameworkCore;

namespace LemonadeStand.Data.Context;

public class GameDbContext : DbContext
{
    public DbSet<GameSaveEntity> GameSaves { get; set; } = null!;

    public GameDbContext(DbContextOptions<GameDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<GameSaveEntity>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(36);
            entity.Property(e => e.PlayerName).HasMaxLength(100);
            entity.Property(e => e.JsonData).IsRequired();
            entity.HasIndex(e => e.UpdatedAt);
        });
    }
}

/// <summary>
/// Simple entity that stores the entire GameState as a JSON blob.
/// This avoids complex EF Core mappings for a single-player game.
/// </summary>
public class GameSaveEntity
{
    public string Id { get; set; } = "";
    public string PlayerName { get; set; } = "";
    public int Day { get; set; }
    public decimal Cash { get; set; }
    public string Stage { get; set; } = "";
    public bool IsGameOver { get; set; }
    public string JsonData { get; set; } = "{}";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
