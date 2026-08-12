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

    [HttpGet("discounts")]
    public async Task<IActionResult> GetDiscounts([FromQuery] string? search = null)
    {
        var games = await _gameRepository.GetAllAsync();
        var gameIds = games
            .Select(game => game.Id)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .ToList();

        var discounts = await _discountRepository.GetByGameIdsAsync(gameIds!);
        var now = DateTime.UtcNow;
        var discountMap = discounts.ToDictionary(discount => discount.GameId, discount => discount);

        var result = games
            .Where(game =>
                string.IsNullOrWhiteSpace(search) ||
                game.Title.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                game.Name.Contains(search, StringComparison.OrdinalIgnoreCase))
            .Select(game =>
            {
                discountMap.TryGetValue(game.Id, out var discount);
                var status = GetStatus(discount, now);
                var discountPercent = discount?.DiscountPercent;
                var finalPrice = SuperBot.Core.Services.PriceCalculator.FinalPrice(game.Price, discountPercent);

                return new
                {
                    gameId = game.Id,
                    title = game.Title,
                    imagePath = game.ImagePath,
                    basePrice = game.Price,
                    discountType = discountPercent.HasValue ? "percentage" : (string?)null,
                    discountValue = discountPercent,
                    finalPrice,
                    discountPercent,
                    startDate = discount?.StartDate,
                    endDate = discount?.EndDate,
                    status
                };
            })
            .OrderBy(item => item.title)
            .ToList();

        return Ok(result);
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
