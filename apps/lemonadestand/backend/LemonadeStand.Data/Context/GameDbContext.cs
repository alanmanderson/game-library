using Microsoft.EntityFrameworkCore;

namespace LemonadeStand.Data.Context;

public class GameDbContext : DbContext
{
    public DbSet<GameSaveEntity> GameSaves { get; set; } = null!;
    public DbSet<UserEntity> Users { get; set; } = null!;

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
            entity.HasIndex(e => e.UserId);
        });

        modelBuilder.Entity<UserEntity>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(36);
            entity.Property(e => e.Email).HasMaxLength(256);
            entity.Property(e => e.DisplayName).HasMaxLength(100);
            entity.HasIndex(e => e.Email).IsUnique();
            entity.HasIndex(e => e.GoogleId);
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
    public string UserId { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class UserEntity
{
    public string Id { get; set; } = "";
    public string Email { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string? PasswordHash { get; set; }
    public string? GoogleId { get; set; }
    public string? AvatarUrl { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastLoginAt { get; set; } = DateTime.UtcNow;
}
