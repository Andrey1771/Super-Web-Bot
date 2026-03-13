using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
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
    private readonly IOrderRepository _orderRepository;
    private readonly IGameRepository _gameRepository;

    public AccountController(
        IMongoDatabase database,
        IWebHostEnvironment environment,
        IOrderRepository orderRepository,
        IGameRepository gameRepository)
    {
        _users = database.GetCollection<UserDb>("Users");
        _environment = environment;
        _orderRepository = orderRepository;
        _gameRepository = gameRepository;
    }

    [HttpGet("orders")]
    public async Task<ActionResult<AccountOrdersResponse>> GetOrders(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string status = "all",
        [FromQuery] string? q = null,
        [FromQuery] string sort = "newest")
    {
        var identity = GetUserIdentity();
        var userNames = ResolveUserAliases(identity).ToArray();
        if (userNames.Length == 0)
        {
            return Unauthorized();
        }

        var query = new OrderQueryParameters
        {
            Page = page < 1 ? 1 : page,
            PageSize = pageSize is < 1 or > 100 ? 10 : pageSize,
            Search = string.IsNullOrWhiteSpace(q) ? null : q.Trim(),
            Status = MapStatus(status),
            Sort = MapSort(sort)
        };

        var (items, totalItems) = await _orderRepository.GetPagedByUsersAsync(userNames, query);
        var mapped = await MapAccountOrdersAsync(items);
        var totalPages = totalItems == 0 ? 0 : (int)Math.Ceiling(totalItems / (double)query.PageSize);

        return Ok(new AccountOrdersResponse
        {
            Items = mapped,
            Page = query.Page,
            PageSize = query.PageSize,
            TotalItems = (int)totalItems,
            TotalPages = totalPages
        });
    }

    [HttpGet("orders/{orderId}")]
    public async Task<ActionResult<AccountOrderDetailsResponse>> GetOrderDetails([FromRoute] string orderId)
    {
        var identity = GetUserIdentity();
        var userNames = ResolveUserAliases(identity).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (userNames.Count == 0)
        {
            return Unauthorized();
        }

        var order = await _orderRepository.GetOrderByIdAsync(orderId);
        if (order == null || !userNames.Contains(order.UserName ?? string.Empty))
        {
            return NotFound();
        }

        var mapped = await MapOrderDetailsAsync(order);
        return Ok(mapped);
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

        var resolvedAvatarPath = user?.AvatarPath;
        var resolvedAvatarUpdatedAt = user?.AvatarUpdatedAt;
        if (string.IsNullOrWhiteSpace(resolvedAvatarPath))
        {
            var recoveredAvatarPath = TryRecoverAvatarPath(userId);
            if (!string.IsNullOrWhiteSpace(recoveredAvatarPath))
            {
                var recoveredAt = DateTime.UtcNow;
                resolvedAvatarPath = recoveredAvatarPath;
                resolvedAvatarUpdatedAt = recoveredAt;
                await _users.UpdateOneAsync(
                    u => u.UserId == userId,
                    Builders<UserDb>.Update
                        .Set(u => u.AvatarPath, recoveredAvatarPath)
                        .Set(u => u.AvatarUpdatedAt, recoveredAt)
                        .Set(u => u.UpdatedAt, recoveredAt)
                        .SetOnInsert(u => u.UserId, userId)
                        .SetOnInsert(u => u.Name, displayName ?? email ?? userId)
                        .SetOnInsert(u => u.Username, displayName ?? email ?? userId)
                        .SetOnInsert(u => u.CreatedAt, recoveredAt),
                    new UpdateOptions { IsUpsert = true }
                );
            }
        }

        return Ok(new AccountProfileResponse
        {
            UserId = userId,
            Email = email,
            DisplayName = user?.Name ?? displayName,
            AvatarUrl = BuildAvatarUrl(resolvedAvatarPath, resolvedAvatarUpdatedAt)
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
        else if (request.RemoveAvatar)
        {
            var safeUserId = NormalizeUserId(userId);
            var avatarFolder = EnsureUserAvatarFolder(safeUserId);
            DeleteAllFilesInFolder(avatarFolder);
            nextAvatarPath = null;
            nextAvatarUpdatedAt = null;
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

    private static IEnumerable<string> ResolveUserAliases((string UserId, string? Email, string? DisplayName) identity)
    {
        var aliases = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(identity.UserId))
        {
            aliases.Add(identity.UserId);
        }

        if (!string.IsNullOrWhiteSpace(identity.Email))
        {
            aliases.Add(identity.Email);
        }

        if (!string.IsNullOrWhiteSpace(identity.DisplayName))
        {
            aliases.Add(identity.DisplayName);
        }

        return aliases;
    }

    private static string? MapStatus(string? status)
    {
        return status?.Trim().ToLowerInvariant() switch
        {
            "completed" => "DELIVERED",
            "refunded" => "REFUNDED",
            "pending" => "PENDING",
            "failed" => "FAILED",
            _ => null
        };
    }

    private static string MapSort(string? sort)
    {
        return sort?.Trim().ToLowerInvariant() switch
        {
            "oldest" => "createdAt:asc",
            "total_desc" => "total:desc",
            "total_asc" => "total:asc",
            _ => "createdAt:desc"
        };
    }

    private Task<List<AccountOrderListItem>> MapAccountOrdersAsync(IEnumerable<Order> orders)
    {
        var mapped = orders.Select(order =>
        {
            var status = ResolveStatus(order);
            var items = order.Items ?? new List<OrderItemSnapshot>();
            var firstItem = items.FirstOrDefault();
            var hasSnapshotItems = items.Count > 0;
            var firstTitle = !string.IsNullOrWhiteSpace(firstItem?.Title)
                ? firstItem.Title
                : !string.IsNullOrWhiteSpace(firstItem?.TitleSnapshot)
                    ? firstItem.TitleSnapshot
                    : !string.IsNullOrWhiteSpace(order.GameName)
                        ? order.GameName
                        : "Game purchase";

            var cover = firstItem?.CoverUrl ?? firstItem?.CoverUrlSnapshot;
            var itemsCount = hasSnapshotItems
                ? items.Sum(item => Math.Max(1, item.Quantity > 0 ? item.Quantity : item.Qty))
                : !string.IsNullOrWhiteSpace(order.GameName) || !string.IsNullOrWhiteSpace(order.GameId)
                    ? 1
                    : 0;

            var orderNumber = string.IsNullOrWhiteSpace(order.OrderNumber)
                ? order.Id.ToString()
                : order.OrderNumber;

            return new AccountOrderListItem
            {
                OrderId = orderNumber,
                InternalId = order.Id.ToString(),
                CreatedAt = (order.CreatedAt == default ? order.OrderDate : order.CreatedAt).ToUniversalTime().ToString("O"),
                Status = status,
                TotalAmount = order.TotalAmount ?? 0m,
                Currency = string.IsNullOrWhiteSpace(order.Currency) ? "USD" : order.Currency,
                ItemsCount = itemsCount,
                PaymentMethod = order.PaymentStatus,
                RefundedAmount = status == "REFUNDED" ? (order.TotalAmount ?? 0m) : 0,
                Preview = new AccountOrderPreview
                {
                    FirstTitle = firstTitle,
                    FirstCoverUrl = cover,
                    ExtraCount = Math.Max(0, itemsCount - 1)
                },
                LegacyDetailsUnavailable = !hasSnapshotItems
            };
        }).ToList();

        return Task.FromResult(mapped);
    }

    private Task<AccountOrderDetailsResponse> MapOrderDetailsAsync(Order order)
    {
        var items = order.Items ?? new List<OrderItemSnapshot>();
        var detailItems = items.Select(item =>
        {
            var title = !string.IsNullOrWhiteSpace(item.Title) ? item.Title : item.TitleSnapshot;
            var quantity = item.Quantity > 0 ? item.Quantity : item.Qty;
            var unitPrice = item.UnitPrice > 0 ? item.UnitPrice : item.UnitPriceSnapshot;
            var discount = item.UnitDiscount > 0 ? item.UnitDiscount : item.DiscountSnapshot;
            var finalUnit = item.FinalUnitPrice > 0 ? item.FinalUnitPrice : item.FinalUnitPriceSnapshot;
            var lineTotal = item.LineTotal > 0 ? item.LineTotal : item.LineTotalSnapshot;

            return new AccountOrderDetailItem
            {
                ItemId = item.ItemId,
                ProductType = string.IsNullOrWhiteSpace(item.ProductType) ? "Game" : item.ProductType,
                GameId = item.GameId,
                Title = string.IsNullOrWhiteSpace(title) ? "Game purchase" : title,
                CoverUrl = item.CoverUrl ?? item.CoverUrlSnapshot,
                Platform = item.Platform ?? item.PlatformSnapshot,
                Region = item.Region ?? item.RegionSnapshot,
                Quantity = Math.Max(1, quantity),
                UnitPrice = unitPrice,
                Currency = string.IsNullOrWhiteSpace(order.Currency) ? "USD" : order.Currency,
                UnitDiscount = discount ?? 0m,
                FinalUnitPrice = finalUnit,
                LineTotal = lineTotal,
                DeliveryType = item.Delivery?.DeliveryType ?? item.DeliveryType,
                Keys = item.Delivery?.Keys?.Select(k => k.KeyMasked ?? string.Empty).Where(k => !string.IsNullOrWhiteSpace(k)).ToList() ?? new List<string>()
            };
        }).ToList();

        var subtotal = order.SubtotalAmount ?? order.Totals.Subtotal;
        var discountTotal = order.DiscountTotal ?? order.Totals.DiscountTotal;
        var taxTotal = order.TaxTotal ?? order.Totals.TaxTotal;
        var total = order.TotalAmount ?? order.Totals.Total;

        if (subtotal <= 0)
        {
            subtotal = detailItems.Sum(item => item.UnitPrice * item.Quantity);
        }
        if (total <= 0)
        {
            total = detailItems.Sum(item => item.LineTotal) + taxTotal;
        }

        var response = new AccountOrderDetailsResponse
        {
            OrderId = string.IsNullOrWhiteSpace(order.OrderNumber) ? order.Id.ToString() : order.OrderNumber,
            InternalId = order.Id.ToString(),
            CreatedAt = (order.CreatedAt == default ? order.OrderDate : order.CreatedAt).ToUniversalTime().ToString("O"),
            PaidAt = order.PaidAt?.ToUniversalTime().ToString("O"),
            Status = ResolveStatus(order),
            Currency = string.IsNullOrWhiteSpace(order.Currency) ? "USD" : order.Currency,
            Totals = new AccountOrderTotals
            {
                Subtotal = subtotal,
                DiscountTotal = discountTotal,
                TaxTotal = taxTotal,
                Total = total
            },
            PaymentMethod = order.PaymentStatus,
            LegacyDetailsUnavailable = detailItems.Count == 0,
            Items = detailItems
        };

        return Task.FromResult(response);
    }

    private static string ResolveStatus(Order order)
    {
        if (!string.IsNullOrWhiteSpace(order.Status))
        {
            return order.Status.ToUpperInvariant();
        }

        if (!order.IsPaid)
        {
            return "PENDING";
        }

        return order.IsFulfilled ? "DELIVERED" : "PROCESSING";
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

public class AccountOrdersResponse
{
    public List<AccountOrderListItem> Items { get; set; } = new();
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalItems { get; set; }
    public int TotalPages { get; set; }
}

public class AccountOrderListItem
{
    public string OrderId { get; set; } = string.Empty;
    public string InternalId { get; set; } = string.Empty;
    public string CreatedAt { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public string Currency { get; set; } = "USD";
    public int ItemsCount { get; set; }
    public string? PaymentMethod { get; set; }
    public decimal RefundedAmount { get; set; }
    public AccountOrderPreview Preview { get; set; } = new();
    public bool LegacyDetailsUnavailable { get; set; }
}

public class AccountOrderPreview
{
    public string FirstTitle { get; set; } = string.Empty;
    public string? FirstCoverUrl { get; set; }
    public int ExtraCount { get; set; }
}

public class AccountOrderDetailsResponse
{
    public string OrderId { get; set; } = string.Empty;
    public string InternalId { get; set; } = string.Empty;
    public string CreatedAt { get; set; } = string.Empty;
    public string? PaidAt { get; set; }
    public string Status { get; set; } = string.Empty;
    public string Currency { get; set; } = "USD";
    public AccountOrderTotals Totals { get; set; } = new();
    public string? PaymentMethod { get; set; }
    public bool LegacyDetailsUnavailable { get; set; }
    public List<AccountOrderDetailItem> Items { get; set; } = new();
}

public class AccountOrderTotals
{
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal Total { get; set; }
}

public class AccountOrderDetailItem
{
    public string ItemId { get; set; } = string.Empty;
    public string ProductType { get; set; } = "Game";
    public string? GameId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? CoverUrl { get; set; }
    public string? Platform { get; set; }
    public string? Region { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public string Currency { get; set; } = "USD";
    public decimal UnitDiscount { get; set; }
    public decimal FinalUnitPrice { get; set; }
    public decimal LineTotal { get; set; }
    public string? DeliveryType { get; set; }
    public List<string> Keys { get; set; } = new();
}

public class AccountProfileUpdateRequest
{
    public string? DisplayName { get; set; }
    public string? Email { get; set; }
    public IFormFile? Avatar { get; set; }
    public bool RemoveAvatar { get; set; }
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
