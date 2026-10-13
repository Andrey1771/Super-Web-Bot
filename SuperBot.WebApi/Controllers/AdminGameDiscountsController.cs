using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Events;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/admin/games")]
[Authorize(Roles = "admin")]
public class AdminGameDiscountsController : ControllerBase
{
    private readonly IGameRepository _gameRepository;
    private readonly IGameDiscountRepository _discountRepository;
    private readonly IBotEventPublisher _botEvents;
    private readonly ICatalogSnapshotService _catalogSnapshot;

    public AdminGameDiscountsController(
        IGameRepository gameRepository,
        IGameDiscountRepository discountRepository,
        IBotEventPublisher botEvents,
        ICatalogSnapshotService catalogSnapshot)
    {
        _gameRepository = gameRepository;
        _discountRepository = discountRepository;
        _botEvents = botEvents;
        _catalogSnapshot = catalogSnapshot;
    }

    /// <summary>
    /// Страница списка скидок: окно строк, поиск и срез по статусу считаются на сервере.
    ///
    /// Раньше сюда уезжал ВЕСЬ каталог, а поиск, фильтр и сортировка выполнялись в браузере
    /// по полученному массиву. На полусотне игр это незаметно, на тридцати тысячах — мегабайты
    /// на каждое открытие экрана и перебор коллекции целиком.
    ///
    /// Статус скидки живёт в отдельной коллекции, поэтому порядок такой: сначала по ней
    /// собираются идентификаторы нужного среза (она маленькая — по документу на игру СО
    /// скидкой), затем страница игр берётся из каталога уже с этим ограничением.
    /// </summary>
    [HttpGet("discounts")]
    public async Task<IActionResult> GetDiscounts(
        [FromQuery] string? search = null,
        [FromQuery] string? status = null,
        [FromQuery] string sortBy = "title",
        [FromQuery] bool desc = false,
        [FromQuery] int skip = 0,
        [FromQuery] int take = 50)
    {
        // Join, статус, итоговая цена, фильтр и сортировка — одним запросом в базе. Раньше
        // сюда читались ВСЕ скидки, чтобы собрать список идентификаторов для фильтра по
        // статусу, и сортировать можно было только по полям самой игры.
        var (rows, total) = await _discountRepository.GetCatalogPageAsync(
            search,
            status,
            sortBy,
            desc,
            skip,
            take,
            DateTime.UtcNow);

        var items = rows.Select(row => new
        {
            gameId = row.GameId,
            title = row.Title,
            imagePath = row.ImagePath,
            basePrice = row.BasePrice,
            discountType = row.DiscountPercent.HasValue ? "percentage" : (string?)null,
            discountValue = row.DiscountPercent,
            finalPrice = SuperBot.Core.Services.PriceCalculator.FinalPrice(row.BasePrice, row.DiscountPercent),
            discountPercent = row.DiscountPercent,
            startDate = row.StartDate,
            endDate = row.EndDate,
            status = row.Status
        }).ToList();

        return Ok(new { items, total });
    }


    [HttpGet("{id}/discount")]
    public async Task<IActionResult> GetDiscount(string id)
    {
        var game = await _gameRepository.GetByIdAsync(id);
        if (game == null)
        {
            return NotFound();
        }

        var discount = await _discountRepository.GetByGameIdAsync(id);
        if (discount == null)
        {
            return Ok(new { gameId = id, discountPercent = (decimal?)null, startDate = (DateTime?)null, endDate = (DateTime?)null, isActive = false });
        }

        return Ok(new
        {
            gameId = discount.GameId,
            discountPercent = discount.DiscountPercent,
            startDate = discount.StartDate,
            endDate = discount.EndDate,
            isActive = discount.IsActiveAt(DateTime.UtcNow)
        });
    }

    [HttpPut("{id}/discount")]
    public async Task<IActionResult> UpsertDiscount(string id, [FromBody] UpsertDiscountRequest request)
    {
        var game = await _gameRepository.GetByIdAsync(id);
        if (game == null)
        {
            return NotFound();
        }

        if (request.DiscountPercent <= 0 || request.DiscountPercent > 95)
        {
            return BadRequest("Discount percent must be between 1 and 95.");
        }

        if (request.EndDate < request.StartDate)
        {
            return BadRequest("End date must be later than start date.");
        }

        var discount = new GameDiscount
        {
            GameId = id,
            DiscountPercent = request.DiscountPercent,
            StartDate = request.StartDate,
            EndDate = request.EndDate
        };

        await _discountRepository.UpsertAsync(discount);
        // Скидка меняет цену на витрине — собранный каталог устарел.
        _catalogSnapshot.Invalidate();

        // Событие в outbox — Telegram-алерты по wishlist разошлёт бот-сервис.
        await _botEvents.PublishAsync(BotEventTypes.GameDiscountActivated, new GameDiscountActivatedEvent(id));

        return Ok(new
        {
            gameId = discount.GameId,
            discountPercent = discount.DiscountPercent,
            startDate = discount.StartDate,
            endDate = discount.EndDate,
            isActive = discount.IsActiveAt(DateTime.UtcNow)
        });
    }

    [HttpDelete("{id}/discount")]
    public async Task<IActionResult> DeleteDiscount(string id)
    {
        var game = await _gameRepository.GetByIdAsync(id);
        if (game == null)
        {
            return NotFound();
        }

        await _discountRepository.DeleteByGameIdAsync(id);
        _catalogSnapshot.Invalidate();
        return NoContent();
    }

    [HttpPost("discounts/bulk-upsert")]
    public async Task<IActionResult> BulkUpsertDiscounts([FromBody] BulkUpsertDiscountRequest request)
    {
        if (request.GameIds == null || request.GameIds.Count == 0)
        {
            return BadRequest("At least one game id is required.");
        }

        if (request.DiscountPercent <= 0 || request.DiscountPercent > 95)
        {
            return BadRequest("Discount percent must be between 1 and 95.");
        }

        if (request.EndDate < request.StartDate)
        {
            return BadRequest("End date must be later than start date.");
        }

        var gameIds = request.GameIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var discounts = gameIds.ToDictionary(id => id, id => new GameDiscount
        {
            GameId = id,
            DiscountPercent = request.DiscountPercent,
            StartDate = request.StartDate,
            EndDate = request.EndDate
        });

        await Task.WhenAll(discounts.Values.Select(_discountRepository.UpsertAsync));
        _catalogSnapshot.Invalidate();

        // События в outbox — алерты по wishlist разошлёт бот-сервис.
        foreach (var id in discounts.Keys)
        {
            await _botEvents.PublishAsync(BotEventTypes.GameDiscountActivated, new GameDiscountActivatedEvent(id));
        }

        return Ok(new { updated = gameIds.Count });
    }

    [HttpPost("discounts/bulk-clear")]
    public async Task<IActionResult> BulkClearDiscounts([FromBody] BulkClearDiscountRequest request)
    {
        if (request.GameIds == null || request.GameIds.Count == 0)
        {
            return BadRequest("At least one game id is required.");
        }

        var tasks = request.GameIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.Ordinal)
            .Select(_discountRepository.DeleteByGameIdAsync);

        await Task.WhenAll(tasks);
        _catalogSnapshot.Invalidate();
        return Ok(new { cleared = request.GameIds.Count });
    }

    private static string GetStatus(GameDiscount? discount, DateTime now)
    {
        if (discount == null)
        {
            return "no_discount";
        }

        if (now < discount.StartDate)
        {
            return "scheduled";
        }

        if (now > discount.EndDate)
        {
            return "expired";
        }

        return "active";
    }

    public class UpsertDiscountRequest
    {
        public decimal DiscountPercent { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
    }

    public class BulkUpsertDiscountRequest
    {
        public List<string> GameIds { get; set; } = new();
        public decimal DiscountPercent { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
    }

    public class BulkClearDiscountRequest
    {
        public List<string> GameIds { get; set; } = new();
    }
}
