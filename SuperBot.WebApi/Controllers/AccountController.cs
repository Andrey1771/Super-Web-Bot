using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using MongoDB.Driver;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;
using SuperBot.WebApi.Services;

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
    private readonly SuperBot.WebApi.Services.UserAvatarStore _avatarStore;
    private readonly IOrderRepository _orderRepository;
    private readonly IGameRepository _gameRepository;
    private readonly IGameReviewRepository _gameReviewRepository;
    private readonly SuperBot.Core.Cashback.ICashbackLedger _cashback;
    private readonly IGameKeyRepository _gameKeys;
    private readonly IDeliveryMailer _mailer;
    private readonly IMemoryCache _cache;
    private readonly IPasswordVerifier _passwords;

    /// <summary>Не чаще одного письма с ключами на заказ за это время — от случайных двойных кликов и от перебора.</summary>
    public static readonly TimeSpan ResendKeysCooldown = TimeSpan.FromMinutes(10);

    /// <summary>Столько неверных паролей подряд — и показ ключей закрывается на <see cref="RevealLockout"/>: перебирать пароль через эту форму нельзя.</summary>
    public const int RevealMaxFailures = 5;
    public static readonly TimeSpan RevealLockout = TimeSpan.FromMinutes(15);

    public AccountController(
        IMongoDatabase database,
        IWebHostEnvironment environment,
        SuperBot.WebApi.Services.UserAvatarStore avatarStore,
        IOrderRepository orderRepository,
        IGameRepository gameRepository,
        IGameReviewRepository gameReviewRepository,
        SuperBot.Core.Cashback.ICashbackLedger cashback,
        IGameKeyRepository gameKeys,
        IDeliveryMailer mailer,
        IMemoryCache cache,
        IPasswordVerifier passwords)
    {
        _cashback = cashback;
        _gameKeys = gameKeys;
        _mailer = mailer;
        _cache = cache;
        _passwords = passwords;
        _users = database.GetCollection<UserDb>("Users");
        _environment = environment;
        _avatarStore = avatarStore;
        _orderRepository = orderRepository;
        _gameRepository = gameRepository;
        _gameReviewRepository = gameReviewRepository;
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

    public sealed record RevealKeysRequest(string? Password);

    /// <summary>
    /// Полные ключи заказа по позициям. В деталях заказа ключи замаскированы — здесь, по явному
    /// «Show keys» и после повторного ввода пароля, отдаются целиком: ключ не должен пропасть
    /// вместе с письмом или доступом к почте, но и угнанная сессия одна его получить не должна.
    /// Показ пишется в журнал заказа. Пять неверных паролей подряд — пауза на четверть часа.
    /// </summary>
    [HttpPost("orders/{orderId}/keys/reveal")]
    public async Task<IActionResult> RevealOrderKeys([FromRoute] string orderId, [FromBody] RevealKeysRequest? request)
    {
        var order = await FindOwnOrderAsync(orderId);
        if (order is null)
        {
            return NotFound();
        }

        var identity = GetUserIdentity();
        var username = User.FindFirstValue("preferred_username") ?? identity.Email ?? string.Empty;
        var failKey = $"account:reveal-fail:{identity.UserId}";
        if (_cache.TryGetValue(failKey, out int failures) && failures >= RevealMaxFailures)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, ApiErrors.Body("order.revealLocked", $"Too many wrong passwords. Try again in {(int)RevealLockout.TotalMinutes} min.", new { minutes = (int)RevealLockout.TotalMinutes }));
        }

        if (!await _passwords.VerifyAsync(username, request?.Password ?? string.Empty))
        {
            var next = (_cache.TryGetValue(failKey, out int current) ? current : 0) + 1;
            _cache.Set(failKey, next, RevealLockout);
            var left = RevealMaxFailures - next;
            return BadRequest(left > 0
                ? ApiErrors.Body("order.wrongPassword", $"Invalid password. {left} attempt{(left == 1 ? "" : "s")} left.", new { count = left })
                : ApiErrors.Body("order.revealLocked", $"Too many wrong passwords. Try again in {(int)RevealLockout.TotalMinutes} min.", new { minutes = (int)RevealLockout.TotalMinutes }));
        }
        _cache.Remove(failKey);

        var delivered = OrderDeliveredKeys.Resolve(order, await _gameKeys.GetByUserAsync(order.UserId, 500));
        var items = delivered
            .GroupBy(entry => entry.ItemId)
            .Select(group => new { itemId = group.Key, keys = group.Select(entry => entry.Key.Key).ToList() })
            .ToList();

        // Журнал: кто и когда смотрел ключи — при споре «мой ключ утёк» это первое, что нужно.
        order.Events ??= new List<OrderEvent>();
        order.Events.Add(new OrderEvent { Type = "keys_viewed", Message = $"Keys shown in the account after password check ({delivered.Count})", Actor = order.UserId, CreatedAt = DateTime.UtcNow });
        await _orderRepository.UpdateOrderAsync(order);

        return Ok(new { items });
    }

    /// <summary>
    /// Переслать письмо с ключами на адрес аккаунта — без обращения в поддержку. Адрес
    /// не выбирается: письмо уходит только туда, куда ушло первое, иначе номер заказа
    /// стал бы паролем от ключей.
    /// </summary>
    [HttpPost("orders/{orderId}/resend-keys")]
    public async Task<IActionResult> ResendOrderKeys([FromRoute] string orderId)
    {
        var order = await FindOwnOrderAsync(orderId);
        if (order is null)
        {
            return NotFound();
        }
        if (string.IsNullOrWhiteSpace(order.UserId) || !order.UserId.Contains('@'))
        {
            return BadRequest(ApiErrors.Body("order.noEmail", "This order has no e-mail on file."));
        }

        var delivered = OrderDeliveredKeys.Resolve(order, await _gameKeys.GetByUserAsync(order.UserId, 500))
            .Select(entry => entry.Key)
            .ToList();
        if (delivered.Count == 0)
        {
            return BadRequest(ApiErrors.Body("order.noKeys", "No keys have been delivered on this order yet."));
        }

        var cooldownKey = $"account:resend-keys:{order.Id}";
        if (_cache.TryGetValue(cooldownKey, out DateTime sentAt))
        {
            var retryIn = ResendKeysCooldown - (DateTime.UtcNow - sentAt);
            return StatusCode(StatusCodes.Status429TooManyRequests, new
            {
                message = $"We have just sent that e-mail. Try again in {Math.Max(1, (int)Math.Ceiling(retryIn.TotalMinutes))} min.",
                code = "order.resendCooldown",
                args = new { minutes = Math.Max(1, (int)Math.Ceiling(retryIn.TotalMinutes)) },
                retryAfterSeconds = (int)Math.Max(1, retryIn.TotalSeconds)
            });
        }

        await _mailer.SendGameKeysAsync(
            order.UserId,
            order.OrderNumber ?? order.Id.ToString(),
            delivered,
            KeyDeliveryReceipt.FromOrder(order),
            KeyDeliveryProgress.FromOrder(order),
            locale: order.Language);

        _cache.Set(cooldownKey, DateTime.UtcNow, ResendKeysCooldown);
        order.Events ??= new List<OrderEvent>();
        order.Events.Add(new OrderEvent { Type = "keys_resent", Message = $"Keys re-sent to {order.UserId} ({delivered.Count}) at the customer's request", Actor = order.UserId, CreatedAt = DateTime.UtcNow });
        await _orderRepository.UpdateOrderAsync(order);

        return Ok(new { sentTo = OrderDeliveredKeys.MaskEmail(order.UserId), count = delivered.Count });
    }

    /// <summary>Заказ текущего пользователя или null — чужой заказ неотличим от несуществующего.</summary>
    private async Task<Order?> FindOwnOrderAsync(string orderId)
    {
        var identity = GetUserIdentity();
        var userNames = ResolveUserAliases(identity).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (userNames.Count == 0)
        {
            return null;
        }
        var order = await _orderRepository.GetOrderByIdAsync(orderId);
        return order == null || !userNames.Contains(order.UserName ?? string.Empty) ? null : order;
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

    private async Task<List<AccountOrderListItem>> MapAccountOrdersAsync(IEnumerable<Order> orders)
    {
        var source = orders.ToList();
        var mapped = source.Select(order =>
        {
            var status = OrderStatusCodes.Resolve(order);
            var items = order.Items ?? new List<OrderItemSnapshot>();
            var firstItem = items.FirstOrDefault();
            var hasSnapshotItems = items.Count > 0;
            var firstTitle = !string.IsNullOrWhiteSpace(firstItem?.Title)
                ? firstItem.Title
                : !string.IsNullOrWhiteSpace(order.GameName)
                    ? order.GameName
                    : "Game purchase";

            var cover = firstItem?.CoverUrl;
            var itemsCount = hasSnapshotItems
                ? items.Sum(item => Math.Max(1, item.Quantity))
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
                PaymentMethod = PaymentInstrument.Describe(order),
                // Записанная сумма возврата точнее прежнего «полный возврат = вся сумма»:
                // при частичном возврате там лежала бы нулевая строка, хотя деньги вернулись.
                // Запасной путь — для заказов, возвращённых до появления поля.
                RefundedAmount = order.RefundedAmount ?? (status == "REFUNDED" ? order.TotalAmount ?? 0m : 0m),
                Preview = new AccountOrderPreview
                {
                    FirstTitle = firstTitle,
                    FirstCoverUrl = cover,
                    ExtraCount = Math.Max(0, itemsCount - 1)
                },
                LegacyDetailsUnavailable = !hasSnapshotItems
            };
        }).ToList();

        // Обложка берётся из снимка заказа: он сделан в момент покупки и не меняется, даже
        // если игру потом убрали из каталога или сменили ей картинку. У старых заказов
        // снимок без обложки — там подставляем нынешнюю картинку игры, одним запросом на
        // всю страницу, иначе список выглядит как набор пустых плашек.
        var lookup = new Dictionary<int, string>();
        for (var i = 0; i < source.Count; i++)
        {
            if (!string.IsNullOrWhiteSpace(mapped[i].Preview.FirstCoverUrl))
            {
                continue;
            }

            var gameId = source[i].Items?.FirstOrDefault()?.GameId;
            if (string.IsNullOrWhiteSpace(gameId))
            {
                gameId = source[i].GameId;
            }

            if (!string.IsNullOrWhiteSpace(gameId))
            {
                lookup[i] = gameId;
            }
        }

        if (lookup.Count > 0)
        {
            var games = await _gameRepository.GetByIdsAsync(lookup.Values.Distinct());
            var coverByGameId = games
                .Where(game => !string.IsNullOrWhiteSpace(game.ImagePath))
                .GroupBy(game => game.Id)
                .ToDictionary(group => group.Key, group => group.First().ImagePath);

            foreach (var (index, gameId) in lookup)
            {
                if (coverByGameId.TryGetValue(gameId, out var cover))
                {
                    mapped[index].Preview.FirstCoverUrl = cover;
                }
            }
        }

        return mapped;
    }

    private async Task<AccountOrderDetailsResponse> MapOrderDetailsAsync(Order order)
    {
        var items = order.Items ?? new List<OrderItemSnapshot>();

        // Про какие из купленных игр человек уже высказался. Одним запросом на весь заказ:
        // спрашивать по позиции — это десяток обращений к базе ради подписи на кнопке.
        var userId = GetUserIdentity().UserId;
        var reviewed = await _gameReviewRepository.GetReviewedGameIdsAsync(
            userId,
            items.Select(item => item.GameId).Where(id => !string.IsNullOrWhiteSpace(id))!);

        // Куда вести и есть ли ещё товар — по каталогу сейчас, а не по снимку: slug мог смениться,
        // игру могли снять с продажи. Название, обложка и цена остаются из снимка — что купили,
        // то и показываем. Один запрос на заказ.
        var gameIds = items.Select(item => item.GameId)
            .Where(id => !string.IsNullOrWhiteSpace(id) && MongoDB.Bson.ObjectId.TryParse(id, out _))
            .Distinct()
            .ToList();
        var gamesById = gameIds.Count == 0
            ? new Dictionary<string, Game>()
            : (await _gameRepository.GetByIdsAsync(gameIds!))
                .Where(game => !string.IsNullOrWhiteSpace(game.Id))
                .ToDictionary(game => game.Id!, game => game);

        var detailItems = items.Select(item =>
        {
            var game = !string.IsNullOrWhiteSpace(item.GameId) && gamesById.TryGetValue(item.GameId, out var found) ? found : null;
            var slug = !string.IsNullOrWhiteSpace(game?.Slug) ? game!.Slug : game is null ? null : item.Slug;
            // Звать оценить можно только то, что доставлено: до выдачи ключа игру не запускали,
            // и отзыв был бы про ожидание, а не про игру. Плюс сам сервер отзыв не примет —
            // ему нужен оплаченный заказ.
            var delivered = order.IsPaid
                && (item.Delivery?.Keys?.Count > 0 || item.Delivery?.DeliveredAt != null);
            var gameId = item.GameId;

            return new AccountOrderDetailItem
            {
                ItemId = item.ItemId,
                ProductType = string.IsNullOrWhiteSpace(item.ProductType) ? "Game" : item.ProductType,
                GameId = item.GameId,
                Title = string.IsNullOrWhiteSpace(item.Title) ? "Game purchase" : item.Title,
                CoverUrl = item.CoverUrl,
                Platform = item.Platform,
                // Регион строки — это и есть выбранный вариант ключа: покупатель платил за
                // «европейский», и в заказе должно стоять то же слово, что он видел на кассе.
                Region = string.IsNullOrWhiteSpace(item.OfferTitle) ? item.Region : item.OfferTitle,
                Quantity = Math.Max(1, item.Quantity),
                UnitPrice = item.UnitPrice,
                Currency = string.IsNullOrWhiteSpace(order.Currency) ? "USD" : order.Currency,
                UnitDiscount = item.UnitDiscount,
                FinalUnitPrice = item.FinalUnitPrice,
                LineTotal = item.LineTotal,
                DeliveryType = item.Delivery?.DeliveryType,
                Keys = item.Delivery?.Keys?.Select(k => k.KeyMasked ?? string.Empty).Where(k => !string.IsNullOrWhiteSpace(k)).ToList() ?? new List<string>(),
                // Адрес страницы игры: без него кабинету некуда вести, у него есть только GameId.
                Slug = slug,
                Available = game is not null,
                CanReview = delivered && !string.IsNullOrWhiteSpace(gameId) && !string.IsNullOrWhiteSpace(slug),
                HasReview = !string.IsNullOrWhiteSpace(gameId) && reviewed.Contains(gameId!)
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
            // Налог внутри цен строк — сверху не прибавляется.
            total = detailItems.Sum(item => item.LineTotal);
        }

        var response = new AccountOrderDetailsResponse
        {
            OrderId = string.IsNullOrWhiteSpace(order.OrderNumber) ? order.Id.ToString() : order.OrderNumber,
            InternalId = order.Id.ToString(),
            CreatedAt = (order.CreatedAt == default ? order.OrderDate : order.CreatedAt).ToUniversalTime().ToString("O"),
            PaidAt = order.PaidAt?.ToUniversalTime().ToString("O"),
            Status = OrderStatusCodes.Resolve(order),
            Currency = string.IsNullOrWhiteSpace(order.Currency) ? "USD" : order.Currency,
            Totals = new AccountOrderTotals
            {
                Subtotal = subtotal,
                DiscountTotal = discountTotal,
                TaxTotal = taxTotal,
                TaxIncluded = true,
                TaxType = order.Tax?.TaxType,
                TaxRatePercent = order.Tax?.RatePercent,
                Total = total
            },
            PaymentMethod = PaymentInstrument.Describe(order),
            Cashback = await MapOrderCashbackAsync(order, total),
            LegacyDetailsUnavailable = detailItems.Count == 0,
            Items = detailItems
        };

        return response;
    }

    /// <summary>
    /// Кэшбэк по заказу для страницы заказа: сколько оплачено им и сколько начислено. Суммы — в валюте заказа:
    /// начисленное считается как процент уровня от оплаченного картой, ровно так же, как при начислении.
    /// null — у заказа нет ни того, ни другого.
    /// </summary>
    private async Task<AccountOrderCashback?> MapOrderCashbackAsync(Order order, decimal paidTotal)
    {
        var currency = string.IsNullOrWhiteSpace(order.Currency) ? "USD" : order.Currency;
        var entries = await _cashback.GetEntriesAsync(order.UserId);
        var orderId = order.Id.ToString();
        var earn = entries.FirstOrDefault(entry => entry.Type == SuperBot.Core.Cashback.CashbackEntryTypes.Earn && entry.OrderId == orderId);
        if (order.CashbackApplied <= 0 && earn == null)
        {
            return null;
        }

        var result = new AccountOrderCashback { Applied = order.CashbackApplied };
        if (earn != null)
        {
            var state = SuperBot.Core.Cashback.CashbackProjection.Project(entries, DateTime.UtcNow).Earns
                .GetValueOrDefault(earn.Id ?? earn.IdempotencyKey);
            // Частичный возврат — показываем оставшееся. Полностью забранное — исходную сумму: страница
            // зачеркнёт её с подписью «taken back», и человек увидит, что именно ушло.
            var keptShare = state == null || state.AmountUsd <= 0 || state.State == "reverted"
                ? 1m
                : 1m - state.ReversedUsd / state.AmountUsd;
            var baseAmount = earn.OrderTotal ?? paidTotal;
            result.Percent = earn.Percent;
            result.Earned = SuperBot.Core.Payments.CurrencyMinorUnits.Round(baseAmount * (earn.Percent ?? 0m) / 100m * keptShare, currency);
            result.EarnedStatus = state?.State ?? "pending";
            result.UnlocksAt = result.EarnedStatus == "pending" ? earn.UnlocksAt?.ToUniversalTime().ToString("O") : null;
        }
        return result;
    }

    // Сборка адреса уехала в Services/UserAvatars: аватар нужен ещё и отзывам, а две копии
    // одной формулы (особенно с меткой версии) разъезжаются при первой же правке.
    private static string? BuildAvatarUrl(string? avatarPath, DateTime? updatedAt) =>
        SuperBot.WebApi.Services.UserAvatars.Build(avatarPath, updatedAt);


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

    // Раскладка папок аватаров и удаление файлов описаны в Services/UserAvatarStore: снимать
    // аватар умеет ещё и модератор, а две копии одной раскладки — верный способ однажды
    // удалить не ту папку.
    private string EnsureUserAvatarFolder(string safeUserId) => _avatarStore.EnsureFolder(safeUserId);

    private static void DeleteAllFilesInFolder(string folder) =>
        SuperBot.WebApi.Services.UserAvatarStore.DeleteAllFilesInFolder(folder);

    private static string NormalizeUserId(string userId) =>
        SuperBot.WebApi.Services.UserAvatarStore.NormalizeUserId(userId);
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
    /// <summary>Кэшбэк по заказу; null — не оплачивался им и не начислялся.</summary>
    public AccountOrderCashback? Cashback { get; set; }
    public bool LegacyDetailsUnavailable { get; set; }
    public List<AccountOrderDetailItem> Items { get; set; } = new();
}

public class AccountOrderCashback
{
    /// <summary>Оплачено кэшбэком, в валюте заказа.</summary>
    public decimal Applied { get; set; }
    /// <summary>Начислено за заказ, в валюте заказа (за вычетом забранного при частичном возврате); null — не начислялось.</summary>
    public decimal? Earned { get; set; }
    public decimal? Percent { get; set; }
    /// <summary>pending | available | spent | expired | reverted.</summary>
    public string? EarnedStatus { get; set; }
    public string? UnlocksAt { get; set; }
}

public class AccountOrderTotals
{
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    /// <summary>Налог уже внутри Subtotal и Total (цены с налогом) — к итогу не прибавлять.</summary>
    public bool TaxIncluded { get; set; }
    /// <summary>vat, gst, sales_tax… и ставка — для подписи «Incl. VAT 22%». null — налог не посчитан.</summary>
    public string? TaxType { get; set; }
    public decimal? TaxRatePercent { get; set; }
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

    /// <summary>Адрес страницы игры (/games/{slug}) по каталогу сейчас. Пусто, если игры больше нет.</summary>
    public string? Slug { get; set; }

    /// <summary>Товар всё ещё в каталоге. Нет — строка без ссылки и с пометкой «больше не продаётся».</summary>
    public bool Available { get; set; }

    /// <summary>
    /// Можно ли предложить оценить эту позицию: заказ оплачен, ключ выдан и известно, куда вести.
    /// Кабинет по этому флагу решает, показывать кнопку или нет, — а не гадает сам.
    /// </summary>
    public bool CanReview { get; set; }

    /// <summary>Отзыв на эту игру человек уже оставил — кнопка ведёт править, а не писать заново.</summary>
    public bool HasReview { get; set; }
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
