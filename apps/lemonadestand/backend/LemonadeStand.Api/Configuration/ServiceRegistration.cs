using LemonadeStand.Api.Services;
using LemonadeStand.Data.Context;
using LemonadeStand.Data.Repositories;
using Microsoft.EntityFrameworkCore;

namespace LemonadeStand.Api.Configuration;

public static class ServiceRegistration
{
    public static IServiceCollection AddGameServices(this IServiceCollection services, IConfiguration configuration)
    {
        // --- EF Core with SQLite ---
        var connectionString = configuration.GetConnectionString("GameDb") ?? "Data Source=lemonade.db";
        services.AddDbContext<GameDbContext>(options => options.UseSqlite(connectionString));

        // --- Repositories ---
        services.AddScoped<GameRepository>();
        services.AddScoped<UserRepository>();

        // --- Services ---
        services.AddScoped<AuthService>();

        return services;
    }

    public static async Task InitializeDatabaseAsync(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        await db.Database.EnsureCreatedAsync();

        // Migrate existing DBs: create Users table if missing (EnsureCreatedAsync
        // does not add new tables to an already-existing database).
        await db.Database.ExecuteSqlRawAsync(@"
            CREATE TABLE IF NOT EXISTS Users (
                Id TEXT NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
                Email TEXT NOT NULL,
                DisplayName TEXT NOT NULL,
                PasswordHash TEXT NULL,
                GoogleId TEXT NULL,
                AvatarUrl TEXT NULL,
                CreatedAt TEXT NOT NULL,
                LastLoginAt TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS IX_Users_Email ON Users (Email);
            CREATE INDEX IF NOT EXISTS IX_Users_GoogleId ON Users (GoogleId);
        ");

        // Migrate existing DBs: add UserId column to GameSaves if missing
        try
        {
            await db.Database.ExecuteSqlRawAsync(
                "ALTER TABLE GameSaves ADD COLUMN UserId TEXT NOT NULL DEFAULT ''");
        }
        catch (Microsoft.Data.Sqlite.SqliteException)
        {
            // Column already exists — ignore
        }

        try
        {
            await db.Database.ExecuteSqlRawAsync(
                "CREATE INDEX IF NOT EXISTS IX_GameSaves_UserId ON GameSaves (UserId)");
        }
        catch (Microsoft.Data.Sqlite.SqliteException)
        {
            // Ignore
        }
    }
}
