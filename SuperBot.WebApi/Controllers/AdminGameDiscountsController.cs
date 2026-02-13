using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/admin/games")]
[Authorize(Roles = "admin")]
public class AdminGameDiscountsController : ControllerBase
{
    private readonly IGameRepository _gameRepository;
    private readonly IGameDiscountRepository _discountRepository;

    public AdminGameDiscountsController(IGameRepository gameRepository, IGameDiscountRepository discountRepository)
    {
        _gameRepository = gameRepository;
        _discountRepository = discountRepository;
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
        return NoContent();
    }

    public class UpsertDiscountRequest
    {
        public decimal DiscountPercent { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
    }
}
