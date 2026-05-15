using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Google.Apis.Auth;
using LemonadeStand.Api.DTOs;
using LemonadeStand.Core.Models;
using LemonadeStand.Data.Repositories;
using Microsoft.IdentityModel.Tokens;

namespace LemonadeStand.Api.Services;

public class AuthService
{
    private readonly UserRepository _userRepo;
    private readonly IConfiguration _config;

    public AuthService(UserRepository userRepo, IConfiguration config)
    {
        _userRepo = userRepo;
        _config = config;
    }

    public string GenerateJwt(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(
            _config["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret not configured")));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.DisplayName),
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"] ?? "LemonadeStand",
            audience: _config["Jwt:Audience"] ?? "LemonadeStand",
            claims: claims,
            expires: DateTime.UtcNow.AddDays(30),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public async Task<AuthResponse?> RegisterAsync(RegisterRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) ||
            string.IsNullOrWhiteSpace(request.Password) ||
            string.IsNullOrWhiteSpace(request.DisplayName))
            return null;

        var existing = await _userRepo.GetByEmailAsync(request.Email);
        if (existing != null) return null;

        var user = new User
        {
            Email = request.Email.ToLowerInvariant(),
            DisplayName = request.DisplayName.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
        };

        await _userRepo.CreateAsync(user);
        return new AuthResponse
        {
            Token = GenerateJwt(user),
            User = MapUserResponse(user),
        };
    }

    public async Task<AuthResponse?> LoginAsync(LoginRequest request)
    {
        var user = await _userRepo.GetByEmailAsync(request.Email);
        if (user == null || user.PasswordHash == null) return null;
        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash)) return null;

        user.LastLoginAt = DateTime.UtcNow;
        await _userRepo.UpdateAsync(user);

        return new AuthResponse
        {
            Token = GenerateJwt(user),
            User = MapUserResponse(user),
        };
    }

    public async Task<AuthResponse?> GoogleLoginAsync(string credential)
    {
        GoogleJsonWebSignature.Payload payload;
        try
        {
            var clientId = _config["Google:ClientId"] ?? "";
            payload = await GoogleJsonWebSignature.ValidateAsync(credential,
                new GoogleJsonWebSignature.ValidationSettings { Audience = new[] { clientId } });
        }
        catch
        {
            return null;
        }

        // Try to find existing user by Google ID
        var user = await _userRepo.GetByGoogleIdAsync(payload.Subject);

        if (user == null)
        {
            // Try to find by email and link Google account
            user = await _userRepo.GetByEmailAsync(payload.Email);
            if (user != null)
            {
                user.GoogleId = payload.Subject;
                user.AvatarUrl ??= payload.Picture;
                user.LastLoginAt = DateTime.UtcNow;
                await _userRepo.UpdateAsync(user);
            }
            else
            {
                // Create new user
                user = new User
                {
                    Email = payload.Email.ToLowerInvariant(),
                    DisplayName = payload.Name ?? payload.Email.Split('@')[0],
                    GoogleId = payload.Subject,
                    AvatarUrl = payload.Picture,
                };
                await _userRepo.CreateAsync(user);
            }
        }
        else
        {
            user.LastLoginAt = DateTime.UtcNow;
            await _userRepo.UpdateAsync(user);
        }

        return new AuthResponse
        {
            Token = GenerateJwt(user),
            User = MapUserResponse(user),
        };
    }

    public async Task<UserResponse?> GetUserAsync(Guid userId)
    {
        var user = await _userRepo.GetByIdAsync(userId);
        return user == null ? null : MapUserResponse(user);
    }

    private static UserResponse MapUserResponse(User u) => new()
    {
        Id = u.Id,
        Email = u.Email,
        DisplayName = u.DisplayName,
        AvatarUrl = u.AvatarUrl,
    };
}
