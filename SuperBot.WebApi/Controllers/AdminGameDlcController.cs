using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// DLC игры в редакторе карточки: список её дополнений (вместе с черновиками), создание нового, привязка
/// существующего товара и отвязка. DLC — обычный товар с ParentGameId; здесь меняется только эта связь, остальное
/// дополнение правится в своём редакторе, как любой товар.
/// </summary>
[ApiController]
[Route("api/admin/games/{gameId}/dlc")]
[Authorize(Roles = "admin")]
public class AdminGameDlcController : ControllerBase
{
    private readonly IGameRepository _games;
    private readonly IGameDetailsRepository _details;
    private readonly ICatalogSnapshotService _catalog;

    public AdminGameDlcController(IGameRepository games, IGameDetailsRepository details, ICatalogSnapshotService catalog)
    {
        _games = games;
        _details = details;
        _catalog = catalog;
    }

    public sealed record DlcRow(
        string Id,
        string Slug,
        string Title,
        string ImagePath,
        decimal Price,
        string Currency,
        bool IsDraft,
        bool IsComingSoon,
        int KeysAvailable,
        DateTime ReleaseDate);

    public sealed record ParentRef(string Id, string Title, string Slug);

    /// <summary>Дополнения игры, дорогие первыми (как на витрине), и — если сама она DLC — её базовая игра.</summary>
    [HttpGet]
    public async Task<IActionResult> List(string gameId)
    {
        var game = await _games.GetByIdAsync(gameId);
        if (game is null)
        {
            return NotFound();
        }
        var catalog = await _catalog.GetWithDraftsAsync();
        var items = catalog
            .Where(item => string.Equals(item.ParentGameId, gameId, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(item => item.Price)
            .ThenBy(item => item.ReleaseDate)
            .Select(item => new DlcRow(
                item.Id,
                item.Slug,
                string.IsNullOrWhiteSpace(item.Title) ? item.Name : item.Title,
                item.ImagePath,
                item.Price,
                item.Currency,
                item.IsDraft,
                item.IsComingSoon,
                item.KeysAvailable,
                item.ReleaseDate))
            .ToList();

        ParentRef? parent = null;
        if (!string.IsNullOrWhiteSpace(game.ParentGameId) && await _games.GetByIdAsync(game.ParentGameId) is { } parentGame)
        {
            parent = new ParentRef(parentGame.Id!, DlcLinks.Title(parentGame), parentGame.Slug ?? "");
        }
        return Ok(new { kind = game.Kind.ToString(), parent, items });
    }

    public sealed class CreateDlcRequest
    {
        public string? Name { get; set; }
        public decimal? Price { get; set; }
    }

    /// <summary>
    /// Новое DLC черновиком: жанр, вид и валюта — от игры, адрес — уникальный (названия дополнений часто общие:
    /// «Season Pass», «Soundtrack», и адрес совпал бы с чужим). Описание, обложку и ключи заполняют в его редакторе.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Create(string gameId, [FromBody] CreateDlcRequest request)
    {
        var parent = await _games.GetByIdAsync(gameId);
        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            return BadRequest(new { message = "Enter the add-on name." });
        }
        if (request.Price is < 0)
        {
            return BadRequest(new { message = "The price can't be negative." });
        }
        var dlc = new Game
        {
            Id = MongoDB.Bson.ObjectId.GenerateNewId().ToString(),
            Name = name,
            Title = name,
            Price = request.Price ?? 0,
            Kind = ProductKind.Game,
        };
        var error = DlcLinks.CheckAttach(dlc, parent, dlcHasOwnDlc: false);
        if (error is not null)
        {
            return parent is null ? NotFound(new { message = error }) : BadRequest(new { message = error });
        }

        dlc.Currency = parent!.Currency;
        dlc.Genre = parent.Genre;
        dlc.GameType = parent.GameType;
        dlc.ParentGameId = parent.Id;
        dlc.ReleaseDate = DateTime.UtcNow.Date;
        dlc.Slug = await FreeSlugAsync(SeoController.Slugify(name));
        dlc.ExternalId = $"web-{dlc.Slug}";
        await _games.CreateAsync(dlc);
        // Черновик — признак карточки: товар без карточки витрина считает опубликованным.
        await _details.UpsertAsync(new GameDetails { GameId = dlc.Id, Slug = dlc.Slug, Title = name, IsDraft = true });
        _catalog.Invalidate();
        return Ok(new { id = dlc.Id, slug = dlc.Slug, title = name });
    }

    /// <summary>Сделать существующий товар дополнением этой игры (в том числе перенести DLC от другой игры).</summary>
    [HttpPut("{dlcId}")]
    public async Task<IActionResult> Attach(string gameId, string dlcId)
    {
        var parent = await _games.GetByIdAsync(gameId);
        var dlc = await _games.GetByIdAsync(dlcId);
        var error = DlcLinks.CheckAttach(dlc, parent, await HasOwnDlcAsync(dlcId));
        if (error is not null)
        {
            return parent is null || dlc is null ? NotFound(new { message = error }) : BadRequest(new { message = error });
        }
        dlc!.ParentGameId = parent!.Id;
        await _games.UpdateAsync(dlc.Id!, dlc);
        _catalog.Invalidate();
        return NoContent();
    }

    /// <summary>Отвязать: дополнение становится самостоятельной игрой (появится в общем каталоге, если опубликовано).</summary>
    [HttpDelete("{dlcId}")]
    public async Task<IActionResult> Detach(string gameId, string dlcId)
    {
        var dlc = await _games.GetByIdAsync(dlcId);
        if (dlc is null || !string.Equals(dlc.ParentGameId, gameId, StringComparison.OrdinalIgnoreCase))
        {
            return NotFound(new { message = "This product is not a DLC of the game." });
        }
        dlc.ParentGameId = null;
        await _games.UpdateAsync(dlc.Id!, dlc);
        _catalog.Invalidate();
        return NoContent();
    }

    public sealed class QuickEditRequest
    {
        public string? Title { get; set; }
        public decimal? Price { get; set; }
        public DateTime? ReleaseDate { get; set; }
        public bool? IsDraft { get; set; }
    }

    /// <summary>
    /// Быстрая правка DLC из списка игры: название, цена, дата выхода, публикация. Товар и его карточка хранят эти
    /// поля по отдельности (каталог читает товар, страница — карточку), поэтому меняются вместе — иначе название в
    /// каталоге и на странице разошлись бы. Описание, медиа и остальное — в полном редакторе DLC.
    /// </summary>
    [HttpPatch("{dlcId}")]
    public async Task<IActionResult> QuickEdit(string gameId, string dlcId, [FromBody] QuickEditRequest request)
    {
        var dlc = await _games.GetByIdAsync(dlcId);
        if (dlc is null || !string.Equals(dlc.ParentGameId, gameId, StringComparison.OrdinalIgnoreCase))
        {
            return NotFound(new { message = "This product is not a DLC of the game." });
        }
        var title = request.Title?.Trim();
        if (request.Title is not null && string.IsNullOrWhiteSpace(title))
        {
            return BadRequest(new { message = "The name can't be empty." });
        }
        if (request.Price is < 0)
        {
            return BadRequest(new { message = "The price can't be negative." });
        }

        if (title is not null)
        {
            dlc.Name = title;
            dlc.Title = title;
        }
        if (request.Price is { } price) dlc.Price = price;
        if (request.ReleaseDate is { } date) dlc.ReleaseDate = DateTime.SpecifyKind(date.Date, DateTimeKind.Utc);
        await _games.UpdateAsync(dlc.Id!, dlc);

        var details = await _details.GetByGameIdAsync(dlcId)
            ?? new GameDetails { GameId = dlcId, Slug = dlc.Slug, Title = DlcLinks.Title(dlc) };
        if (title is not null) details.Title = title;
        if (request.Price is { } basePrice) details.BasePrice = basePrice;
        if (request.ReleaseDate is not null) details.ReleaseDate = dlc.ReleaseDate;
        if (request.IsDraft is { } draft) details.IsDraft = draft;
        await _details.UpsertAsync(details);

        _catalog.Invalidate();
        return NoContent();
    }

    private async Task<bool> HasOwnDlcAsync(string gameId) =>
        (await _catalog.GetWithDraftsAsync()).Any(item => string.Equals(item.ParentGameId, gameId, StringComparison.OrdinalIgnoreCase));

    private async Task<string> FreeSlugAsync(string slug)
    {
        var baseSlug = string.IsNullOrWhiteSpace(slug) ? "dlc" : slug;
        for (var attempt = 1; ; attempt++)
        {
            var candidate = attempt == 1 ? baseSlug : $"{baseSlug}-{attempt}";
            if (await _games.GetBySlugAsync(candidate) is null && await _details.GetBySlugAsync(candidate) is null)
            {
                return candidate;
            }
        }
    }
}
