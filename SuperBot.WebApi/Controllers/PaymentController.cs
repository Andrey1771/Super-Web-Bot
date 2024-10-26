using AutoMapper;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PaymentController(IGameRepository _gameRepository, IMapper _mapper) : Controller
    {
        [HttpGet]
        public async Task<IActionResult> GetAllGames()
        {
            var games = await _gameRepository.GetAllAsync();
            return Ok(games);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetGameById(string id)
        {
            var game = await _gameRepository.GetByIdAsync(id);
            if (game == null)
            {
                return NotFound();
            }
            return Ok(game);
        }
    }
}
