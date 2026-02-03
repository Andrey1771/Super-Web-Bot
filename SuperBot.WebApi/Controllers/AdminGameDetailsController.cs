using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using System.Text.RegularExpressions;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/admin/games")]
[Authorize(Roles = "admin")]
public class AdminGameDetailsController : ControllerBase
{
    private readonly IGameRepository _gameRepository;
    private readonly IGameDetailsRepository _gameDetailsRepository;

    public AdminGameDetailsController(IGameRepository gameRepository, IGameDetailsRepository gameDetailsRepository)
    {
        _gameRepository = gameRepository;
        _gameDetailsRepository = gameDetailsRepository;
    }

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

        await _gameDetailsRepository.UpsertAsync(payload);
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
        details.Currency = request.Currency;
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

        var normalized = value.Trim().ToLowerInvariant();
        normalized = Regex.Replace(normalized, @"[^\p{L}\p{N}\s-]", string.Empty);
        normalized = Regex.Replace(normalized, @"\s+", "-");
        normalized = Regex.Replace(normalized, @"-+", "-");
        return normalized;
    }
}
