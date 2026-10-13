using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using MongoDB.Bson;
using MongoDB.Driver;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Публичная проверка «магазин может обслуживать» — для внешнего пингера.
///
/// Это единственный ответ, которого нельзя получить изнутри: страница здоровья в админке
/// молчит вместе с сайтом, если сайт лёг. Поэтому наружу нужен адрес, который дёргает
/// монитор с чужой машины.
///
/// Глубина выбрана намеренно. Проверять один только nginx бессмысленно: он отдаёт статику и
/// с мёртвой базой, а каталог при этом пуст. Поэтому здесь запрос к Mongo — то есть «сайт
/// открывается И товар может быть показан». Дальше в глубину идти нельзя: Stripe и почта
/// ломаются сами по себе, магазин при этом работает, и гасить из-за них внешний монитор —
/// значит будить владельца ночью по поводу, который подождёт до утра.
///
/// Наружу не уходит ничего, кроме слова «ok» или «down»: адрес публичный, и рассказывать
/// анониму, что именно у нас сломано, незачем. Подробности — в /admin/health.
/// </summary>
[ApiController]
[Route("api/health")]
[AllowAnonymous]
public class HealthController : ControllerBase
{
    private const string CacheKey = "public-health";

    /// <summary>
    /// Ответ живёт пять секунд. Адрес публичный и дёргается пингером раз в минуту, но
    /// закрывать им дорогу к базе для любого желающего всё равно не стоит.
    /// </summary>
    private static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(5);

    private readonly IMongoDatabase _database;
    private readonly IMemoryCache _cache;
    private readonly ILogger<HealthController> _logger;

    public HealthController(IMongoDatabase database, IMemoryCache cache, ILogger<HealthController> logger)
    {
        _database = database;
        _cache = cache;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        // Вердикт о здоровье кэшировать по дороге нельзя: закэшированное «ok» переживёт
        // аварию и монитор её не заметит.
        Response.Headers.CacheControl = "no-store";

        var healthy = await _cache.GetOrCreateAsync(CacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = CacheFor;
            try
            {
                await _database.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1), cancellationToken: ct);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Public health check failed");
                return false;
            }
        });

        return healthy
            ? Ok(new { status = "ok" })
            : StatusCode(StatusCodes.Status503ServiceUnavailable, new { status = "down" });
    }
}
