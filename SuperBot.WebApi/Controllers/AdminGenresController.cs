using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Жанры игр в админке: название, адрес и порядок — так же, как категории софта.
/// Адрес (tag) — часть ссылки на страницу жанра и значение жанра у игры, поэтому жанр с играми нельзя удалить,
/// а его адрес — сменить: игры выпали бы из жанра, а старые ссылки перестали бы открываться. Название менять можно.
/// </summary>
[ApiController]
[Route("api/admin/genres")]
[Authorize(Roles = "admin")]
public class AdminGenresController : ControllerBase
{
    private static readonly Regex TagPattern = new("^[a-z0-9]+(-[a-z0-9]+)*$", RegexOptions.Compiled);
    private const int MaxGenres = 50;
    private const int MaxTitleLength = 60;

    private readonly IGameRepository _games;
    private readonly ISettingsRepository _settings;
    private readonly IGameGenreDirectory _genres;
    private readonly ICatalogSnapshotService _catalogSnapshot;

    public AdminGenresController(IGameRepository games, ISettingsRepository settings, IGameGenreDirectory genres, ICatalogSnapshotService catalogSnapshot)
    {
        _games = games;
        _settings = settings;
        _genres = genres;
        _catalogSnapshot = catalogSnapshot;
    }

    /// <summary>Titles — названия на языках сайта (ru/uk/pl); английское — Title.</summary>
    public sealed record GenreDto(string Tag, string Title, Dictionary<string, string>? Titles = null);

    /// <summary>Жанры в порядке фильтров и сколько игр в каждом — включая черновики и DLC: их тоже нельзя осиротить.</summary>
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var genres = await _genres.GetAsync();
        var counts = await CountGamesByGenreAsync();
        return Ok(genres.Select(genre => new
        {
            tag = genre.Tag,
            title = genre.Title,
            titles = genre.Titles,
            count = counts.TryGetValue(genre.Tag, out var count) ? count : 0
        }));
    }

    /// <summary>Заменяет список целиком: порядок массива — порядок жанров в фильтрах каталога.</summary>
    [HttpPut]
    public async Task<IActionResult> Save([FromBody] List<GenreDto>? request)
    {
        var list = (request ?? new List<GenreDto>())
            .Select(genre => new GenreDto((genre.Tag ?? string.Empty).Trim().ToLowerInvariant(), (genre.Title ?? string.Empty).Trim(), genre.Titles))
            .ToList();

        if (list.Count == 0)
        {
            return BadRequest(new { message = "Keep at least one genre." });
        }
        // Переводы: только языки сайта, без пустых, не длиннее английского лимита.
        var titlesByTag = new Dictionary<string, Dictionary<string, string>?>();
        foreach (var genre in list)
        {
            titlesByTag[genre.Tag] = SuperBot.WebApi.Services.Storefront.TaxonomyTitles.NormalizeTitles(genre.Titles, MaxTitleLength, out var titlesError);
            if (titlesError is not null)
            {
                return BadRequest(new { message = $"Genre “{genre.Tag}”: {titlesError}" });
            }
        }
        if (list.Count > MaxGenres)
        {
            return BadRequest(new { message = $"No more than {MaxGenres} genres." });
        }
        var badTag = list.FirstOrDefault(genre => !TagPattern.IsMatch(genre.Tag));
        if (badTag is not null)
        {
            return BadRequest(new { message = $"Address “{badTag.Tag}” can use only lowercase letters, digits and dashes." });
        }
        var badTitle = list.FirstOrDefault(genre => genre.Title.Length == 0 || genre.Title.Length > MaxTitleLength);
        if (badTitle is not null)
        {
            return BadRequest(new { message = $"Genre “{badTitle.Tag}” needs a name up to {MaxTitleLength} characters." });
        }
        var duplicate = list.GroupBy(genre => genre.Tag).FirstOrDefault(group => group.Count() > 1);
        if (duplicate is not null)
        {
            return BadRequest(new { message = $"Address “{duplicate.Key}” is used twice." });
        }
        // Одинаковые названия путали бы фильтр: две строки «Action» с разным составом.
        var sameTitle = list.GroupBy(genre => genre.Title, StringComparer.OrdinalIgnoreCase).FirstOrDefault(group => group.Count() > 1);
        if (sameTitle is not null)
        {
            return BadRequest(new { message = $"Name “{sameTitle.Key}” is used twice." });
        }

        var counts = await CountGamesByGenreAsync();
        var orphaned = counts.Keys.Where(tag => counts[tag] > 0 && list.All(genre => genre.Tag != tag)).ToList();
        if (orphaned.Count > 0)
        {
            return Conflict(new
            {
                message = $"Move the games out first: {string.Join(", ", orphaned.Select(tag => $"{tag} ({counts[tag]})"))}.",
                tags = orphaned
            });
        }

        var settings = (await _settings.GetAllAsync()).FirstOrDefault();
        if (settings is null)
        {
            return NotFound(new { message = "Site settings are not initialised yet." });
        }
        settings.GameCategories = list.Select(genre => new GameCategory { Tag = genre.Tag, Title = genre.Title, Titles = titlesByTag[genre.Tag] }).ToArray();
        await _settings.UpdateAsync(settings);
        _genres.Invalidate();
        // Названия жанров вшиты в собранный каталог — без сброса витрина показывала бы старые до истечения кэша.
        _catalogSnapshot.Invalidate();
        return await Get();
    }

    private async Task<Dictionary<string, int>> CountGamesByGenreAsync() =>
        (await _games.GetAllAsync())
            .Where(game => game is not null && game.Kind != ProductKind.Software)
            .GroupBy(GameGenres.TagOf)
            .ToDictionary(group => group.Key, group => group.Count());
}
