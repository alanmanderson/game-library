using LemonadeStand.Core.Models;
using LemonadeStand.Data.Context;
using Microsoft.EntityFrameworkCore;

namespace LemonadeStand.Data.Repositories;

public class UserRepository
{
    private readonly GameDbContext _db;

    public UserRepository(GameDbContext db) => _db = db;

    public async Task<User?> GetByIdAsync(Guid id)
    {
        var entity = await _db.Users.FindAsync(id.ToString());
        return entity == null ? null : MapToUser(entity);
    }

    public async Task<User?> GetByEmailAsync(string email)
    {
        var entity = await _db.Users.FirstOrDefaultAsync(u => u.Email == email.ToLowerInvariant());
        return entity == null ? null : MapToUser(entity);
    }

    public async Task<User?> GetByGoogleIdAsync(string googleId)
    {
        var entity = await _db.Users.FirstOrDefaultAsync(u => u.GoogleId == googleId);
        return entity == null ? null : MapToUser(entity);
    }

    public async Task<User> CreateAsync(User user)
    {
        var entity = new UserEntity
        {
            Id = user.Id.ToString(),
            Email = user.Email.ToLowerInvariant(),
            DisplayName = user.DisplayName,
            PasswordHash = user.PasswordHash,
            GoogleId = user.GoogleId,
            AvatarUrl = user.AvatarUrl,
            CreatedAt = user.CreatedAt,
            LastLoginAt = user.LastLoginAt,
        };
        _db.Users.Add(entity);
        await _db.SaveChangesAsync();
        return user;
    }

    public async Task UpdateAsync(User user)
    {
        var entity = await _db.Users.FindAsync(user.Id.ToString());
        if (entity == null) return;
        entity.Email = user.Email.ToLowerInvariant();
        entity.DisplayName = user.DisplayName;
        entity.PasswordHash = user.PasswordHash;
        entity.GoogleId = user.GoogleId;
        entity.AvatarUrl = user.AvatarUrl;
        entity.LastLoginAt = user.LastLoginAt;
        await _db.SaveChangesAsync();
    }

    private static User MapToUser(UserEntity e) => new()
    {
        Id = Guid.Parse(e.Id),
        Email = e.Email,
        DisplayName = e.DisplayName,
        PasswordHash = e.PasswordHash,
        GoogleId = e.GoogleId,
        AvatarUrl = e.AvatarUrl,
        CreatedAt = e.CreatedAt,
        LastLoginAt = e.LastLoginAt,
    };
}
