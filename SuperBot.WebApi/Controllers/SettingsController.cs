using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class SettingsController(IGameRepository _gameRepository) : Controller
    {
        [HttpGet]
        public async Task<IActionResult> GetGameCategories()
        {
            var games = await _gameRepository.GetAllAsync();
            return Ok(games);
        }
    }
}
