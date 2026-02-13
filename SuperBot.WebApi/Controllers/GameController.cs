using AutoMapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GameController : ControllerBase
    {
        private readonly IGameRepository _gameRepository;
        private readonly IGameDiscountRepository _gameDiscountRepository;
        private readonly IMapper _mapper;

        public GameController(
            IGameRepository gameRepository,
            IGameDiscountRepository gameDiscountRepository,
            IMapper mapper)
        {
            _gameRepository = gameRepository;
            _gameDiscountRepository = gameDiscountRepository;
            _mapper = mapper;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllGames()
        {
            var games = await _gameRepository.GetAllAsync();
            var discounts = await _gameDiscountRepository.GetByGameIdsAsync(games.Select(game => game.Id));
            var discountByGameId = discounts.ToDictionary(discount => discount.GameId, discount => discount);
            var utcNow = DateTime.UtcNow;

            var result = games.Select(game =>
            {
                discountByGameId.TryGetValue(game.Id, out var discount);
                var discountActive = discount is not null && discount.IsActiveAt(utcNow);
                var discountPercent = discountActive ? discount!.DiscountPercent : (decimal?)null;
                var finalPrice = CalculateFinalPrice(game.Price, discountPercent);

                return new
                {
                    id = game.Id,
                    slug = game.Slug,
                    name = game.Name,
                    description = game.Description,
                    title = game.Title,
                    gameType = game.GameType,
                    imagePath = game.ImagePath,
                    releaseDate = game.ReleaseDate,
                    price = game.Price,
                    finalPrice,
                    discountPercent,
                    discountActive
                };
            });

            return Ok(result);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetGameById(string id)
        {
            var game = await _gameRepository.GetByIdAsync(id);
            if (game == null)
            {
                return NotFound();
            }

            var discount = await _gameDiscountRepository.GetByGameIdAsync(id);
            var discountActive = discount is not null && discount.IsActiveAt(DateTime.UtcNow);
            var discountPercent = discountActive ? discount!.DiscountPercent : (decimal?)null;
            var finalPrice = CalculateFinalPrice(game.Price, discountPercent);

            return Ok(new
            {
                id = game.Id,
                slug = game.Slug,
                name = game.Name,
                description = game.Description,
                title = game.Title,
                gameType = game.GameType,
                imagePath = game.ImagePath,
                releaseDate = game.ReleaseDate,
                price = game.Price,
                finalPrice,
                discountPercent,
                discountActive
            });
        }

        [HttpPost]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> CreateGame([FromBody] Game newGame)
        {
            var game = _mapper.Map<Game>(newGame);
            await _gameRepository.CreateAsync(game);
            return CreatedAtAction(nameof(GetGameById), new { id = Guid.NewGuid() }, game);
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> UpdateGame(string id, [FromBody] Game updatedGame)
        {
            var game = await _gameRepository.GetByIdAsync(id);
            if (game == null)
            {
                return NotFound();
            }

            var updatedGameForDb = _mapper.Map<Game>(updatedGame);
            await _gameRepository.UpdateAsync(id, updatedGameForDb);
            return NoContent();
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> DeleteGame(string id)
        {
            var game = await _gameRepository.GetByIdAsync(id);
            if (game == null)
            {
                return NotFound();
            }

            await _gameRepository.DeleteAsync(id);
            await _gameDiscountRepository.DeleteByGameIdAsync(id);
            return NoContent();
        }

        private static decimal CalculateFinalPrice(decimal price, decimal? discountPercent)
        {
            if (!discountPercent.HasValue || discountPercent.Value <= 0)
            {
                return price;
            }

            var result = price * (1 - (discountPercent.Value / 100m));
            return Math.Round(result, 2, MidpointRounding.AwayFromZero);
        }
    }
}
