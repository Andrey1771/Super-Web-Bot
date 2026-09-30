using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using System.Text;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/admin/games")]
[Authorize(Roles = "admin")]
public class AdminGameDetailsController : ControllerBase
{
    private readonly IGameRepository _gameRepository;
    private readonly IGameDetailsRepository _gameDetailsRepository;
    private readonly SuperBot.WebApi.Services.ICatalogSnapshotService _catalogSnapshot;
    private readonly IGameKeyRepository _keys;

    public AdminGameDetailsController(
        IGameRepository gameRepository,
        IGameDetailsRepository gameDetailsRepository,
        SuperBot.WebApi.Services.ICatalogSnapshotService catalogSnapshot,
        IGameKeyRepository keys)
    {
        _gameRepository = gameRepository;
        _gameDetailsRepository = gameDetailsRepository;
        _catalogSnapshot = catalogSnapshot;
        _keys = keys;
    }

    /// <summary>Остаток по лицензиям — только у ПО: у игр издания без ключей бывают законно (предзаказ).</summary>
    private async Task<IReadOnlyDictionary<string, IReadOnlyDictionary<string, int>>> SoftwareStockAsync(IEnumerable<Game> games)
    {
        var ids = games.Where(g => g.Kind == ProductKind.Software && !string.IsNullOrWhiteSpace(g.Id)).Select(g => g.Id!).ToList();
        return ids.Count == 0
            ? new Dictionary<string, IReadOnlyDictionary<string, int>>()
            : await _keys.CountAvailableByEditionForGamesAsync(ids);
    }

    private static IReadOnlyDictionary<string, int>? StockOf(Game game, IReadOnlyDictionary<string, IReadOnlyDictionary<string, int>> stock) =>
        game.Kind != ProductKind.Software
            ? null
            : stock.TryGetValue(game.Id ?? string.Empty, out var byEdition) ? byEdition : new Dictionary<string, int>();

    [HttpGet("{id}/details")]
    public async Task<IActionResult> GetGameDetails(string id)
    {
        var game = await _gameRepository.GetByIdAsync(id);
        if (game == null)
        {
            return NotFound();
        }

        var details = await _gameDetailsRepository.GetByGameIdAsync(id) ?? new GameDetails { GameId = id };
        return Ok(details);
    }

    /// <summary>Полнота карточки одной игры: список пробелов для панели предупреждений в редакторе.</summary>
    [HttpGet("{id}/completeness")]
    public async Task<IActionResult> GetCompleteness(string id)
    {
        var game = await _gameRepository.GetByIdAsync(id);
        if (game == null)
        {
            return NotFound();
        }
        var details = await _gameDetailsRepository.GetByGameIdAsync(id);
        var stock = await SoftwareStockAsync(new[] { game });
        var issues = SuperBot.WebApi.Services.GameCardCompleteness.Check(game, details, StockOf(game, stock));
        return Ok(new { gameId = id, issues });
    }

    /// <summary>
    /// Полнота карточек по всему каталогу — для списка игр в админке («3 пробела») и дашборда.
    /// Только игры с пробелами; у каждой — счётчик по важности и сами пробелы.
    /// </summary>
    [HttpGet("completeness")]
    public async Task<IActionResult> GetCompletenessOverview()
    {
        var games = (await _gameRepository.GetAllAsync()).Where(g => g is not null && !string.IsNullOrWhiteSpace(g.Id)).ToList();
        var rows = new List<object>();
        var stock = await SoftwareStockAsync(games);
        // Карточки — одним запросом на весь список, а не по запросу на каждую игру.
        var detailsByGameId = (await _gameDetailsRepository.GetByGameIdsAsync(games.Select(g => g.Id!)))
            .Where(d => !string.IsNullOrWhiteSpace(d.GameId))
            .GroupBy(d => d.GameId!)
            .ToDictionary(g => g.Key, g => g.First());
        foreach (var game in games)
        {
            detailsByGameId.TryGetValue(game.Id!, out var details);
            var issues = SuperBot.WebApi.Services.GameCardCompleteness.Check(game, details, StockOf(game, stock));
            if (issues.Count == 0)
            {
                continue;
            }
            rows.Add(new
            {
                gameId = game.Id,
                title = string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title,
                errors = issues.Count(i => i.Severity == "error"),
                warnings = issues.Count(i => i.Severity == "warning"),
                infos = issues.Count(i => i.Severity == "info"),
                issues
            });
        }
        return Ok(new { total = games.Count, incomplete = rows.Count, items = rows });
    }

    /// <summary>
    /// Копия товара черновиком — для похожих позиций (ещё один VPN, та же линейка лицензий). Копируются карточка,
    /// лицензии с ценами, активация, системы и требования; ключи, отзывы и рейтинг — нет: это про конкретный товар.
    /// Черновик — чтобы копия не появилась на витрине с чужим названием и описанием, пока её не поправили.
    /// </summary>
    [HttpPost("{id}/duplicate")]
    public async Task<IActionResult> Duplicate(string id)
    {
        var source = await _gameRepository.GetByIdAsync(id);
        if (source == null)
        {
            return NotFound();
        }

        // Глубокая копия через JSON: у товара вложенные списки (цены, лицензии, галерея), и общая ссылка
        // на них между оригиналом и копией проявилась бы при первой же правке.
        static T Clone<T>(T value) => System.Text.Json.JsonSerializer.Deserialize<T>(System.Text.Json.JsonSerializer.Serialize(value))!;

        var title = $"{(string.IsNullOrWhiteSpace(source.Title) ? source.Name : source.Title)} (copy)";
        var baseSlug = NormalizeSlug(string.IsNullOrWhiteSpace(source.Slug) ? title : $"{source.Slug}-copy");
        var slug = baseSlug;
        for (var attempt = 2; await _gameRepository.GetBySlugAsync(slug) != null; attempt++)
        {
            slug = $"{baseSlug}-{attempt}";
        }

        var copy = Clone(source);
        copy.Id = MongoDB.Bson.ObjectId.GenerateNewId().ToString();
        copy.ExternalId = null;
        copy.Slug = slug;
        copy.Title = title;
        copy.Name = $"{source.Name} (copy)";
        await _gameRepository.CreateAsync(copy);

        var sourceDetails = await _gameDetailsRepository.GetByGameIdAsync(id);
        var details = sourceDetails is null ? new GameDetails() : Clone(sourceDetails);
        details.Id = null;
        details.GameId = copy.Id;
        details.Slug = slug;
        details.Title = title;
        details.IsDraft = true;
        details.RatingAvg = 0;
        details.ReviewsCount = 0;
        await _gameDetailsRepository.UpsertAsync(details);

        _catalogSnapshot.Invalidate();
        return Ok(new { id = copy.Id, slug, title });
    }

    [HttpPut("{id}/details")]
    public async Task<IActionResult> UpdateDetails(string id, [FromBody] GameDetails payload)
    {
        var game = await _gameRepository.GetByIdAsync(id);
        if (game == null)
        {
            return NotFound();
        }

        payload.GameId = id;
        var fallbackSlug = string.IsNullOrWhiteSpace(game.Slug) ? NormalizeSlug(game.Title ?? game.Name) : NormalizeSlug(game.Slug);
        payload.Slug = string.IsNullOrWhiteSpace(payload.Slug) ? fallbackSlug : NormalizeSlug(payload.Slug);
        payload.Title = string.IsNullOrWhiteSpace(payload.Title) ? game.Title ?? game.Name : payload.Title;
        SuperBot.WebApi.Services.Storefront.GameDetailsLocalizer.NormalizeForSave(payload);

        await _gameDetailsRepository.UpsertAsync(payload);

        // Снимок каталога кэшируется на две минуты, а публикация должна быть видна сразу:
        // без сброса выложенная карточка не появлялась бы на витрине до истечения кэша,
        // а снятая — продолжала бы показываться.
        _catalogSnapshot.Invalidate();
        return Ok(payload);
    }

    [HttpPut("{id}/media")]
    public async Task<IActionResult> UpdateMedia(string id, [FromBody] MediaUpdateRequest request)
    {
        var details = await _gameDetailsRepository.GetByGameIdAsync(id);
        if (details == null)
        {
            return NotFound();
        }

        details.Cover = request.Cover;
        details.Gallery = request.Gallery ?? new List<GameMediaItem>();
        SuperBot.WebApi.Services.Storefront.GameDetailsLocalizer.NormalizeMedia(details.Gallery);
        await _gameDetailsRepository.UpsertAsync(details);
        return Ok(details);
    }

    [HttpPut("{id}/pricing")]
    public async Task<IActionResult> UpdatePricing(string id, [FromBody] PricingUpdateRequest request)
    {
        var details = await _gameDetailsRepository.GetByGameIdAsync(id);
        if (details == null)
        {
            return NotFound();
        }

        details.BasePrice = request.BasePrice;
        details.DiscountPercent = request.DiscountPercent;
        // Валюта описания больше не принимается: единственный её источник — сама игра
        // (Game.Currency и прайс-лист). Раньше это поле позволяло подписать цену любой
        // валютой, никак не связанной с расчётом. Существующие значения не трогаем —
        // их всё равно никто не читает.
        details.KeyType = request.KeyType;
        details.IsActive = request.IsActive;
        details.IsNew = request.IsNew;
        details.IsTopRated = request.IsTopRated;
        details.FinalPrice = request.FinalPrice;

        await _gameDetailsRepository.UpsertAsync(details);
        return Ok(details);
    }

    [HttpPut("{id}/editions")]
    public async Task<IActionResult> UpdateEditions(string id, [FromBody] List<GameEdition> editions)
    {
        var details = await _gameDetailsRepository.GetByGameIdAsync(id);
        if (details == null)
        {
            return NotFound();
        }

        details.Editions = editions ?? new List<GameEdition>();
        SuperBot.WebApi.Services.Storefront.GameDetailsLocalizer.NormalizeEditions(details.Editions);
        await _gameDetailsRepository.UpsertAsync(details);
        return Ok(details);
    }

    [HttpPut("{id}/dlc")]
    public async Task<IActionResult> UpdateDlc(string id, [FromBody] List<GameDlcItem> dlcItems)
    {
        var details = await _gameDetailsRepository.GetByGameIdAsync(id);
        if (details == null)
        {
            return NotFound();
        }

        details.DlcItems = dlcItems ?? new List<GameDlcItem>();
        await _gameDetailsRepository.UpsertAsync(details);
        return Ok(details);
    }

    [HttpPut("{id}/requirements")]
    public async Task<IActionResult> UpdateRequirements(string id, [FromBody] GameSystemRequirements requirements)
    {
        var details = await _gameDetailsRepository.GetByGameIdAsync(id);
        if (details == null)
        {
            return NotFound();
        }

        details.SystemRequirements = requirements ?? new GameSystemRequirements();
        SuperBot.WebApi.Services.Storefront.GameDetailsLocalizer.NormalizeRequirements(details.SystemRequirements);
        await _gameDetailsRepository.UpsertAsync(details);
        return Ok(details);
    }

    [HttpPut("{id}/awards")]
    public async Task<IActionResult> UpdateAwards(string id, [FromBody] List<GameAwardBadge> awards)
    {
        var details = await _gameDetailsRepository.GetByGameIdAsync(id);
        if (details == null)
        {
            return NotFound();
        }

        details.Awards = awards ?? new List<GameAwardBadge>();
        SuperBot.WebApi.Services.Storefront.GameDetailsLocalizer.NormalizeAwards(details.Awards);
        await _gameDetailsRepository.UpsertAsync(details);
        return Ok(details);
    }

    [HttpPut("{id}/recommendations")]
    public async Task<IActionResult> UpdateRecommendations(string id, [FromBody] RecommendationsUpdateRequest request)
    {
        var details = await _gameDetailsRepository.GetByGameIdAsync(id);
        if (details == null)
        {
            return NotFound();
        }

        details.SimilarGameIds = request.SimilarGameIds ?? new List<string>();
        details.AutoRecommendRules = request.AutoRecommendRules ?? new GameAutoRecommendRules();
        await _gameDetailsRepository.UpsertAsync(details);
        return Ok(details);
    }

    public class MediaUpdateRequest
    {
        public GameCover Cover { get; set; }
        public List<GameMediaItem> Gallery { get; set; } = new();
    }

    public class PricingUpdateRequest
    {
        public decimal BasePrice { get; set; }
        public decimal? DiscountPercent { get; set; }
        public decimal FinalPrice { get; set; }
        public string Currency { get; set; }
        public GameKeyType KeyType { get; set; }
        public bool IsActive { get; set; }
        public bool IsNew { get; set; }
        public bool IsTopRated { get; set; }
    }

    public class RecommendationsUpdateRequest
    {
        public List<string> SimilarGameIds { get; set; } = new();
        public GameAutoRecommendRules AutoRecommendRules { get; set; } = new();
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
