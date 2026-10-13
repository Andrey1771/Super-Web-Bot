using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// ПО в админке: вид товара (игра или ПО) с категорией раздела и сам список категорий софта.
///
/// Вид меняется отдельным запросом, а не через PUT /api/game: тот принимает объект Game целиком, и форма, не
/// знающая о виде, при каждом сохранении сбрасывала бы ПО обратно в игру. Поэтому PUT /api/game вид не трогает.
/// </summary>
[ApiController]
[Route("api/admin/software")]
[Authorize(Roles = "admin")]
public class AdminSoftwareController : ControllerBase
{
    /// <summary>Tag — часть адреса (/games?type=software&softwareCategory={tag}): строчные латинские буквы, цифры и дефис.</summary>
    private static readonly Regex TagPattern = new("^[a-z0-9]+(-[a-z0-9]+)*$", RegexOptions.Compiled);
    private const int MaxCategories = 30;
    private const int MaxTitleLength = 60;

    private readonly IGameRepository _games;
    private readonly ISettingsRepository _settings;
    private readonly ISoftwareCategoryDirectory _categories;
    private readonly ICatalogSnapshotService _catalogSnapshot;

    public AdminSoftwareController(IGameRepository games, ISettingsRepository settings, ISoftwareCategoryDirectory categories, ICatalogSnapshotService catalogSnapshot)
    {
        _games = games;
        _settings = settings;
        _categories = categories;
        _catalogSnapshot = catalogSnapshot;
    }

    /// <summary>Titles — названия на языках сайта (ru/uk/pl); английское — Title.</summary>
    public sealed record CategoryDto(string Tag, string Title, Dictionary<string, string>? Titles = null);

    public sealed record ProductKindRequest(string? Kind, string? SoftwareCategory);

    /// <summary>Категории в порядке раздела и сколько товаров в каждой — включая черновики, их тоже нельзя осиротить.</summary>
    [HttpGet("categories")]
    public async Task<IActionResult> GetCategories()
    {
        var categories = await LoadCategoriesAsync();
        var counts = await CountProductsByCategoryAsync();
        return Ok(categories.Select(category => new
        {
            tag = category.Tag,
            title = category.Title,
            titles = category.Titles,
            count = counts.TryGetValue(category.Tag, out var count) ? count : 0
        }));
    }

    /// <summary>
    /// Заменяет список категорий целиком (порядок — порядок раздела). Категорию с товарами удалить нельзя: товары
    /// пропали бы из раздела, а проверка карточки этого бы не показала — категория у них формально заполнена.
    /// </summary>
    [HttpPut("categories")]
    public async Task<IActionResult> SaveCategories([FromBody] List<CategoryDto>? request)
    {
        var list = (request ?? new List<CategoryDto>())
            .Select(category => new CategoryDto((category.Tag ?? string.Empty).Trim().ToLowerInvariant(), (category.Title ?? string.Empty).Trim(), category.Titles))
            .ToList();

        if (list.Count == 0)
        {
            return BadRequest(new { message = "Keep at least one category." });
        }
        var titlesByTag = new Dictionary<string, Dictionary<string, string>?>();
        foreach (var category in list)
        {
            titlesByTag[category.Tag] = SuperBot.WebApi.Services.Storefront.TaxonomyTitles.NormalizeTitles(category.Titles, MaxTitleLength, out var titlesError);
            if (titlesError is not null)
            {
                return BadRequest(new { message = $"Category “{category.Tag}”: {titlesError}" });
            }
        }
        if (list.Count > MaxCategories)
        {
            return BadRequest(new { message = $"No more than {MaxCategories} categories." });
        }
        var badTag = list.FirstOrDefault(category => !TagPattern.IsMatch(category.Tag));
        if (badTag is not null)
        {
            return BadRequest(new { message = $"Address “{badTag.Tag}” can use only lowercase letters, digits and dashes." });
        }
        var badTitle = list.FirstOrDefault(category => category.Title.Length == 0 || category.Title.Length > MaxTitleLength);
        if (badTitle is not null)
        {
            return BadRequest(new { message = $"Category “{badTitle.Tag}” needs a name up to {MaxTitleLength} characters." });
        }
        var duplicate = list.GroupBy(category => category.Tag).FirstOrDefault(group => group.Count() > 1);
        if (duplicate is not null)
        {
            return BadRequest(new { message = $"Address “{duplicate.Key}” is used twice." });
        }

        var counts = await CountProductsByCategoryAsync();
        var orphaned = counts.Keys.Where(tag => counts[tag] > 0 && list.All(category => category.Tag != tag)).ToList();
        if (orphaned.Count > 0)
        {
            return Conflict(new
            {
                message = $"Move the products out first: {string.Join(", ", orphaned.Select(tag => $"{tag} ({counts[tag]})"))}.",
                tags = orphaned
            });
        }

        var settings = (await _settings.GetAllAsync()).FirstOrDefault();
        if (settings is null)
        {
            return NotFound(new { message = "Site settings are not initialised yet." });
        }
        settings.SoftwareCategories = list.Select(category => new GameCategory { Tag = category.Tag, Title = category.Title, Titles = titlesByTag[category.Tag] }).ToArray();
        await _settings.UpdateAsync(settings);
        // Названия категорий вшиты в снимок каталога (поле Category у ПО): без сброса витрина показывала бы старые.
        _categories.Invalidate();
        _catalogSnapshot.Invalidate();
        return await GetCategories();
    }

    /// <summary>Вид товара и категория. У ПО категория обязательна и должна быть из списка; у игры она снимается.</summary>
    [HttpGet("products/{id}/kind")]
    public async Task<IActionResult> GetProductKind(string id)
    {
        var game = await _games.GetByIdAsync(id);
        return game is null
            ? NotFound()
            : Ok(new { kind = game.Kind.ToString(), softwareCategory = game.SoftwareCategory });
    }

    [HttpPut("products/{id}/kind")]
    public async Task<IActionResult> SetProductKind(string id, [FromBody] ProductKindRequest request)
    {
        var game = await _games.GetByIdAsync(id);
        if (game is null)
        {
            return NotFound();
        }
        if (!Enum.TryParse<ProductKind>(request.Kind, ignoreCase: true, out var kind) || !Enum.IsDefined(kind))
        {
            return BadRequest(new { message = "Kind must be Game or Software." });
        }

        string? category = null;
        if (kind == ProductKind.Software)
        {
            var error = await ValidateCategoryAsync(request.SoftwareCategory);
            if (error is not null)
            {
                return BadRequest(new { message = error });
            }
            category = request.SoftwareCategory!.Trim().ToLowerInvariant();
            // DLC — игровое понятие: у ПО нет «базовой игры», и в режиме софта такой товар не показался бы.
            if (!string.IsNullOrWhiteSpace(game.ParentGameId))
            {
                return BadRequest(new { message = "A DLC can't be software — detach it from the base game first." });
            }
        }

        game.Kind = kind;
        game.SoftwareCategory = category;
        await _games.UpdateAsync(id, game);
        _catalogSnapshot.Invalidate();
        return Ok(new { kind = game.Kind.ToString(), softwareCategory = game.SoftwareCategory });
    }

    /// <summary>Проверка категории для ПО: null — всё в порядке, иначе текст ошибки для админа.</summary>
    internal async Task<string?> ValidateCategoryAsync(string? tag)
    {
        if (string.IsNullOrWhiteSpace(tag))
        {
            return "Pick a software category.";
        }
        var categories = await LoadCategoriesAsync();
        return categories.Any(category => string.Equals(category.Tag, tag.Trim(), StringComparison.OrdinalIgnoreCase))
            ? null
            : $"Unknown software category “{tag}”.";
    }

    private Task<IReadOnlyList<GameCategory>> LoadCategoriesAsync() => _categories.GetAsync();

    /// <summary>Сколько товаров в каждой категории: по снимку каталога с черновиками, а не чтением всей коллекции игр.</summary>
    private async Task<Dictionary<string, int>> CountProductsByCategoryAsync() =>
        (await _catalogSnapshot.GetWithDraftsAsync())
            .Where(item => item.Kind == ProductKind.Software && !string.IsNullOrWhiteSpace(item.SoftwareCategory))
            .GroupBy(item => item.SoftwareCategory!.ToLowerInvariant())
            .ToDictionary(group => group.Key, group => group.Count());
}
