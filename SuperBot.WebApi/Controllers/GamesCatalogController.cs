using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GamesCatalogController : ControllerBase
    {
        private readonly IGameRepository _gameRepository;

        public GamesCatalogController(IGameRepository gameRepository)
        {
            _gameRepository = gameRepository;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllGames()
        {
            var games = await _gameRepository.GetAllGamesAsync();
            return Ok(games);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetGameById(string id)
        {
            var game = await _gameRepository.GetGameByIdAsync(id);
            if (game == null)
            {
                return NotFound();
            }
            return Ok(game);
        }

        [HttpPost]
        public async Task<IActionResult> CreateGame([FromBody] GameDto newGameDto)
        {
            var newGame = GameMapper.MapToModel(newGameDto); // Если используется маппер
            var game = await _gameRepository.CreateGameAsync(newGame);
            return CreatedAtAction(nameof(GetGameById), new { id = game.Id }, game);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateGame(string id, [FromBody] GameDto updatedGameDto)
        {
            var game = await _gameRepository.GetGameByIdAsync(id);
            if (game == null)
            {
                return NotFound();
            }

            var updatedGame = GameMapper.MapToModel(updatedGameDto); // Если используется маппер
            await _gameRepository.UpdateGameAsync(id, updatedGame);
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteGame(string id)
        {
            var game = await _gameRepository.GetGameByIdAsync(id);
            if (game == null)
            {
                return NotFound();
            }

            await _gameRepository.DeleteGameAsync(id);
            return NoContent();
        }
    }
}
