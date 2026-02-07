using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;
using SuperBot.Infrastructure.Data;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/account")]
[Authorize]
public class AccountController : ControllerBase
{
    private const int AvatarSize = 256;
    private const long MaxAvatarBytes = 2 * 1024 * 1024;
    private static readonly string[] AllowedContentTypes = { "image/jpeg", "image/png", "image/webp" };

    private readonly IMongoCollection<UserDb> _users;
    private readonly IWebHostEnvironment _environment;

    public AccountController(IMongoDatabase database, IWebHostEnvironment environment)
    {
        _users = database.GetCollection<UserDb>("Users");
        _environment = environment;
    }

    [HttpGet("me")]
    public async Task<ActionResult<AccountProfileResponse>> GetMe()
    {
        var (userId, email, displayName) = GetUserIdentity();
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var user = await _users.Find(u => u.UserId == userId).FirstOrDefaultAsync();

        if (user != null && string.IsNullOrWhiteSpace(user.AvatarPath))
        {
            var recoveredAvatarPath = TryRecoverAvatarPath(userId);
            if (!string.IsNullOrWhiteSpace(recoveredAvatarPath))
            {
                var recoveredAt = DateTime.UtcNow;
                user.AvatarPath = recoveredAvatarPath;
                user.AvatarUpdatedAt = recoveredAt;
                await _users.UpdateOneAsync(
                    u => u.UserId == userId,
                    Builders<UserDb>.Update
                        .Set(u => u.AvatarPath, recoveredAvatarPath)
                        .Set(u => u.AvatarUpdatedAt, recoveredAt)
                        .Set(u => u.UpdatedAt, recoveredAt)
                );
            }
        }

        return Ok(new AccountProfileResponse
        {
            UserId = userId,
            Email = email,
            DisplayName = user?.Name ?? displayName,
            AvatarUrl = BuildAvatarUrl(user?.AvatarPath, user?.AvatarUpdatedAt)
        });
    }

    [HttpPatch("profile")]
    [RequestSizeLimit(MaxAvatarBytes + 1024)]
    public async Task<ActionResult<AccountProfileResponse>> SaveProfile([FromForm] AccountProfileUpdateRequest request)
    {
        var (userId, email, fallbackDisplayName) = GetUserIdentity();
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var now = DateTime.UtcNow;
        var existing = await _users.Find(u => u.UserId == userId).FirstOrDefaultAsync();

        var nextDisplayName = string.IsNullOrWhiteSpace(request.DisplayName)
            ? existing?.Name ?? fallbackDisplayName ?? email ?? userId
            : request.DisplayName.Trim();

        string? nextAvatarPath = existing?.AvatarPath;
        DateTime? nextAvatarUpdatedAt = existing?.AvatarUpdatedAt;

        if (request.Avatar is { } avatar)
        {
            if (avatar.Length > MaxAvatarBytes)
            {
                return BadRequest("File too large.");
            }

            if (!AllowedContentTypes.Contains(avatar.ContentType, StringComparer.OrdinalIgnoreCase))
            {
                return BadRequest("Unsupported file format.");
            }

            var safeUserId = NormalizeUserId(userId);
            var avatarFolder = EnsureUserAvatarFolder(safeUserId);
            DeleteAllFilesInFolder(avatarFolder);

            var filename = "avatar.webp";
            var relativePath = Path.Combine("avatars", safeUserId, filename).Replace("\\", "/");
            var fullPath = Path.Combine(avatarFolder, filename);

            try
            {
                await using var stream = avatar.OpenReadStream();
                using var image = await Image.LoadAsync(stream);
                image.Mutate(x => x.AutoOrient().Resize(new ResizeOptions
                {
                    Mode = ResizeMode.Crop,
                    Size = new Size(AvatarSize, AvatarSize),
                    Position = AnchorPositionMode.Center
                }));

                await image.SaveAsync(fullPath, new WebpEncoder { Quality = 80 });
            }
            catch
            {
                return BadRequest("Invalid image.");
            }

            nextAvatarPath = relativePath;
            nextAvatarUpdatedAt = now;
        }

        var update = Builders<UserDb>.Update
            .Set(u => u.Name, nextDisplayName)
            .Set(u => u.Username, nextDisplayName)
            .Set(u => u.AvatarPath, nextAvatarPath)
            .Set(u => u.AvatarUpdatedAt, nextAvatarUpdatedAt)
            .Set(u => u.UpdatedAt, now)
            .SetOnInsert(u => u.UserId, userId)
            .SetOnInsert(u => u.CreatedAt, now);

        await _users.UpdateOneAsync(u => u.UserId == userId, update, new UpdateOptions { IsUpsert = true });

        return Ok(new AccountProfileResponse
        {
            UserId = userId,
            Email = request.Email ?? email,
            DisplayName = nextDisplayName,
            AvatarUrl = BuildAvatarUrl(nextAvatarPath, nextAvatarUpdatedAt)
        });
    }

    [HttpDelete("avatar")]
    public async Task<ActionResult<AvatarResponse>> DeleteAvatar()
    {
        var (userId, email, displayName) = GetUserIdentity();
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var safeUserId = NormalizeUserId(userId);
        var avatarFolder = EnsureUserAvatarFolder(safeUserId);
        DeleteAllFilesInFolder(avatarFolder);

        var update = Builders<UserDb>.Update
            .Set(u => u.AvatarPath, null)
            .Set(u => u.AvatarUpdatedAt, null)
            .Set(u => u.UpdatedAt, DateTime.UtcNow)
            .SetOnInsert(u => u.UserId, userId)
            .SetOnInsert(u => u.Username, displayName ?? email ?? userId)
            .SetOnInsert(u => u.Name, displayName ?? email ?? userId)
            .SetOnInsert(u => u.CreatedAt, DateTime.UtcNow);

        await _users.UpdateOneAsync(u => u.UserId == userId, update, new UpdateOptions { IsUpsert = true });

        return Ok(new AvatarResponse { AvatarUrl = null });
    }

    private (string UserId, string? Email, string? DisplayName) GetUserIdentity()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;
        var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");
        var displayName = User.FindFirstValue("preferred_username")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.FindFirstValue("name");

        return (userId, email, displayName);
    }

    private string? BuildAvatarUrl(string? avatarPath, DateTime? updatedAt)
    {
        if (string.IsNullOrWhiteSpace(avatarPath))
        {
            return null;
        }

        var baseUrl = $"{Request.Scheme}://{Request.Host}";
        var version = updatedAt?.Ticks.ToString() ?? DateTime.UtcNow.Ticks.ToString();
        return $"{baseUrl}/uploads/{avatarPath}?v={version}";
    }


    private string? TryRecoverAvatarPath(string userId)
    {
        var safeUserId = NormalizeUserId(userId);
        var avatarFolder = EnsureUserAvatarFolder(safeUserId);
        var avatarPath = Path.Combine(avatarFolder, "avatar.webp");
        if (!System.IO.File.Exists(avatarPath))
        {
            return null;
        }

        return Path.Combine("avatars", safeUserId, "avatar.webp").Replace("\\", "/");
    }

    private string EnsureUserAvatarFolder(string safeUserId)
    {
        var webRoot = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var root = Path.Combine(webRoot, "uploads", "avatars", safeUserId);
        if (!Directory.Exists(root))
        {
            Directory.CreateDirectory(root);
        }

        return root;
    }

    private static void DeleteAllFilesInFolder(string folder)
    {
        if (!Directory.Exists(folder))
        {
            return;
        }

        foreach (var filePath in Directory.GetFiles(folder))
        {
            System.IO.File.Delete(filePath);
        }
    }

    private static string NormalizeUserId(string userId)
    {
        var cleaned = Regex.Replace(userId, @"[^a-zA-Z0-9_-]", string.Empty);
        return string.IsNullOrWhiteSpace(cleaned) ? "user" : cleaned;
    }
}

public class AccountProfileUpdateRequest
{
    public string? DisplayName { get; set; }
    public string? Email { get; set; }
    public IFormFile? Avatar { get; set; }
}

public class AccountProfileResponse
{
    public string UserId { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? DisplayName { get; set; }
    public string? AvatarUrl { get; set; }
}

public class AvatarResponse
{
    public string? AvatarUrl { get; set; }
}
