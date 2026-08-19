using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using System.Text;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/games")]
public class GamesDetailsController : ControllerBase
{
    private readonly IGameRepository _gameRepository;
    private readonly IGameDetailsRepository _gameDetailsRepository;
    private readonly IGameReviewRepository _gameReviewRepository;
    private readonly IWishlistRepository _wishlistRepository;
    private readonly IOrderRepository _orderRepository;
    private readonly SuperBot.Core.Payments.StorefrontCurrencyOptions _currencies;
    private readonly SuperBot.Infrastructure.Services.IFxRateService _fxRates;
    private readonly SuperBot.Core.Payments.FxOptions _fx;

    public GamesDetailsController(
        IGameRepository gameRepository,
        IGameDetailsRepository gameDetailsRepository,
        IGameReviewRepository gameReviewRepository,
        IWishlistRepository wishlistRepository,
        IOrderRepository orderRepository,
        Microsoft.Extensions.Options.IOptions<SuperBot.Core.Payments.StorefrontCurrencyOptions> currencies,
        SuperBot.Infrastructure.Services.IFxRateService fxRates,
        Microsoft.Extensions.Options.IOptionsSnapshot<SuperBot.Core.Payments.FxOptions> fx)
    {
        _gameRepository = gameRepository;
        _gameDetailsRepository = gameDetailsRepository;
        _gameReviewRepository = gameReviewRepository;
        _wishlistRepository = wishlistRepository;
        _orderRepository = orderRepository;
        _currencies = currencies.Value;
        _fxRates = fxRates;
        _fx = fx.Value;
    }

    [HttpGet("{slug}")]
    public async Task<IActionResult> GetGameBySlug(string slug, [FromQuery] string? currency = null)
    {
        if (string.IsNullOrWhiteSpace(slug))
        {
            return BadRequest("Slug is required.");
        }

        var normalizedSlug = NormalizeSlug(slug);
        var details = await _gameDetailsRepository.GetBySlugAsync(normalizedSlug);
        if (details == null && normalizedSlug != slug)
        {
            details = await _gameDetailsRepository.GetBySlugAsync(slug);
        }
        if (details == null)
        {
            var game = await _gameRepository.GetBySlugAsync(normalizedSlug)
                ?? (normalizedSlug != slug ? await _gameRepository.GetBySlugAsync(slug) : null)
                ?? await FindGameByIdentifierAsync(slug, normalizedSlug);
            if (game == null)
            {
                return NotFound();
            }

            details = BuildDefaultDetails(game);
            await _gameDetailsRepository.UpsertAsync(details);
        }

        var summary = await _gameReviewRepository.GetSummaryAsync(details.GameId);
        details.RatingAvg = summary.Average;
        details.ReviewsCount = summary.Count;

        // Продаваемость определяет Game.ReleaseDate (единый источник истины, см. GameRelease) —
        // ReleaseDate внутри GameDetails чисто витринный и на статус не влияет.
        var linkedGame = string.IsNullOrWhiteSpace(details.GameId)
            ? null
            : await _gameRepository.GetByIdAsync(details.GameId);

        // Цена — в валюте покупателя, тем же путём, что и каталог: ручная цена из прайс-листа
        // игры, иначе пересчёт по курсу с наценкой и округлением. Раньше карточка отдавала
        // базовую цену, а фронт подставлял к ней символ выбранной валюты — $30 превращались в €30.
        var resolvedCurrency = _currencies.Resolve(currency);
        var pricing = BuildPricing(details, linkedGame, resolvedCurrency);

        // Цены изданий — в той же валюте и по тем же правилам (ручная → курс → нет). Отдаём
        // отдельной картой по коду издания: сама сущность details уходит как есть, и у её изданий
        // Price — в базовой валюте, им на фронте пользоваться нельзя.
        var editionPricing = BuildEditionPricing(details, linkedGame, resolvedCurrency);
        var isComingSoon = linkedGame != null &&
            SuperBot.Core.Services.GameRelease.IsUpcoming(linkedGame.ReleaseDate, DateTime.UtcNow);

        var heroBadges = BuildHeroBadges(details);
        var recommendations = new
        {
            moreLikeThis = await BuildRecommendations(details)
        };

        var userContext = await BuildUserContext(details.GameId);

        return Ok(new
        {
            game = details,
            isComingSoon,
            pricing,
            editionPricing,
            ratingSummary = new
            {
                avg = summary.Average,
                count = summary.Count,
                distribution = summary.Distribution
            },
            heroBadges,
            recommendations,
            userContext
        });
    }

    private async Task<Game?> FindGameByIdentifierAsync(string slug, string normalizedSlug)
    {
        var games = await _gameRepository.GetAllAsync();
        return games.FirstOrDefault(candidate =>
            candidate != null &&
            (
                string.Equals(candidate.Id, slug, StringComparison.OrdinalIgnoreCase)
                || NormalizeSlug(candidate.Slug) == normalizedSlug
                || NormalizeSlug(candidate.Title ?? candidate.Name) == normalizedSlug
            ));
    }

    [HttpGet("{slug}/recommendations")]
    public async Task<IActionResult> GetRecommendations(string slug, [FromQuery] int limit = 8)
    {
        var normalizedSlug = NormalizeSlug(slug);
        var details = await _gameDetailsRepository.GetBySlugAsync(normalizedSlug);
        if (details == null && normalizedSlug != slug)
        {
            details = await _gameDetailsRepository.GetBySlugAsync(slug);
        }
        if (details == null)
        {
            return NotFound();
        }

        var recommendations = await BuildRecommendations(details, limit);
        return Ok(new { items = recommendations });
    }

    private GameDetails BuildDefaultDetails(Game game)
    {
        return new GameDetails
        {
            GameId = game.Id,
            Slug = string.IsNullOrWhiteSpace(game.Slug)
                ? NormalizeSlug(game.Title ?? game.Name)
                : NormalizeSlug(game.Slug),
            Title = string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title,
            Tagline = string.Empty,
            DescriptionMarkdown = string.Empty,
            Cover = string.IsNullOrWhiteSpace(game.ImagePath)
                ? null
                : new GameCover { Url = game.ImagePath, Alt = game.Title ?? game.Name },
            Genres = new List<string> { GameTypeMapper.DescriptionsCategories[game.GameType] },
            BasePrice = game.Price,
            Currency = "USD",
            FinalPrice = game.Price,
            IsActive = true,
            ShowInFeaturedStorefront = false,
            FeaturedStorefrontPriority = 0,
            Platforms = new GamePlatforms { Windows = true },
            ReleaseDate = game.ReleaseDate
        };
    }

    private Dictionary<string, object?> BuildEditionPricing(GameDetails details, Game? linkedGame, string currency)
    {
        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        foreach (var edition in details.Editions ?? new List<GameEdition>())
        {
            if (string.IsNullOrWhiteSpace(edition.Code))
            {
                continue;
            }
            decimal? basePrice = linkedGame is not null
                ? SuperBot.Core.Payments.GamePricing.TryGetEditionPrice(edition, linkedGame, currency, _fxRates.Current(), _fx)
                : (string.Equals(details.Currency ?? "USD", currency, StringComparison.OrdinalIgnoreCase) ? edition.Price : null);
            if (basePrice is null)
            {
                result[edition.Code] = null;
                continue;
            }
            var discount = edition.DiscountPercent ?? 0;
            var final = SuperBot.Core.Services.PriceCalculator.FinalPrice(basePrice.Value, edition.DiscountPercent);
            result[edition.Code] = new
            {
                price = final,
                oldPrice = discount > 0 ? basePrice : (decimal?)null,
                discountPercent = discount > 0 ? discount : (decimal?)null,
                currency
            };
        }
        return result;
    }

    private object? BuildPricing(GameDetails details, Game? linkedGame, string currency)
    {
        var discount = details.DiscountPercent ?? 0;

        // Базовая цена в запрошенной валюте. Без связанной игры (деталь-сирота) остаётся старое
        // поведение — цена детали в её собственной валюте, и только если валюта совпала.
        decimal? basePrice;
        if (linkedGame is not null)
        {
            basePrice = SuperBot.Core.Payments.GamePricing.TryGetPrice(linkedGame, currency, _fxRates.Current(), _fx);
        }
        else
        {
            basePrice = string.Equals(details.Currency ?? "USD", currency, StringComparison.OrdinalIgnoreCase) ? details.BasePrice : null;
        }

        if (basePrice is null)
        {
            // В этой валюте игру не продаём — честный null вместо цены с подменённым символом.
            // Фронт покажет «недоступно в EUR» и список валют, где цена есть.
            details.FinalPrice = SuperBot.Core.Services.PriceCalculator.FinalPrice(details.BasePrice, details.DiscountPercent);
            return null;
        }

        var finalPrice = SuperBot.Core.Services.PriceCalculator.FinalPrice(basePrice.Value, details.DiscountPercent);
        details.FinalPrice = finalPrice;

        return new
        {
            price = finalPrice,
            oldPrice = discount > 0 ? basePrice : (decimal?)null,
            discountPercent = discount > 0 ? discount : (decimal?)null,
            currency
        };
    }

    private static List<string> BuildHeroBadges(GameDetails details)
    {
        var badges = new List<string>();
        if (details.IsTopRated)
        {
            badges.Add("Top rated");
        }
        if (details.IsNew)
        {
            badges.Add("New");
        }
        if (details.DiscountPercent.HasValue && details.DiscountPercent.Value > 0)
        {
            badges.Add($"-{details.DiscountPercent.Value:0}%");
        }
        badges.Add(details.KeyType switch
        {
            GameKeyType.Epic => "Epic key",
            GameKeyType.EaApp => "EA App",
            GameKeyType.Uplay => "Uplay key",
            _ => "Steam key"
        });
        return badges;
    }

    private async Task<List<object>> BuildRecommendations(GameDetails details, int limit = 8)
    {
        var normalizedLimit = Math.Clamp(limit, 1, 12);
        var results = new List<object>();

        if (details.SimilarGameIds?.Count > 0)
        {
            var similarGames = await _gameRepository.GetByIdsAsync(details.SimilarGameIds);
            results.AddRange(similarGames.Select(BuildGameCard));
        }

        if (results.Count < normalizedLimit)
        {
            var allGames = await _gameRepository.GetAllAsync();
            var fallback = allGames
                .Where(game => game.Id != details.GameId)
                .Take(normalizedLimit - results.Count)
                .Select(BuildGameCard);
            results.AddRange(fallback);
        }

        return results.Take(normalizedLimit).ToList();
    }

    private object BuildGameCard(Game game)
    {
        return new
        {
            id = game.Id,
            slug = game.Slug,
            title = string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title,
            coverUrl = game.ImagePath,
            price = game.Price,
            rating = 0
        };
    }

    private async Task<object> BuildUserContext(string gameId)
    {
        if (!User.Identity?.IsAuthenticated ?? true)
        {
            return new { isWishlisted = false, hasPurchased = false, myReview = (object)null };
        }

        var userId = GetUserId();
        var userName = GetUserName();
        var wishlistIds = await _wishlistRepository.GetGameIdsAsync(userId);
        var orders = await _orderRepository.GetOrdersByUserAsync(userName);
        var hasPurchased = orders.Any(order => order.GameId == gameId && order.IsPaid);
        var review = await _gameReviewRepository.GetByUserAsync(gameId, userId);

        return new
        {
            isWishlisted = wishlistIds.Contains(gameId),
            hasPurchased,
            myReview = review
        };
    }

    private string GetUserId()
    {
        return User.FindFirst("sub")?.Value ?? User.FindFirst("userId")?.Value ?? string.Empty;
    }

    private string GetUserName()
    {
        return User.Identity?.Name ?? User.FindFirst("preferred_username")?.Value ?? User.FindFirst("email")?.Value ?? string.Empty;
    }

    private static string NormalizeSlug(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder();
        var lastWasDash = false;

        foreach (var ch in value.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(ch))
            {
                builder.Append(ch);
                lastWasDash = false;
                continue;
            }

            if (ch == ' ' || ch == '-' || ch == '_')
            {
                if (!lastWasDash && builder.Length > 0)
                {
                    builder.Append('-');
                    lastWasDash = true;
                }
            }
        }

        var normalized = builder.ToString().Trim('-');
        return normalized;
    }
}
