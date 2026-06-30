using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/admin/keys")]
    [Authorize(Roles = "admin")]
    public class AdminGameKeysController : ControllerBase
    {
        private readonly IGameKeyRepository _gameKeyRepository;
        private readonly IKeyFulfillmentService _fulfillment;

        public AdminGameKeysController(IGameKeyRepository gameKeyRepository, IKeyFulfillmentService fulfillment)
        {
            _gameKeyRepository = gameKeyRepository;
            _fulfillment = fulfillment;
        }

        // Счётчики пула по игре: сколько доступно (не выдано) и сколько выдано.
        [HttpGet("inventory/{gameId}")]
        public async Task<IActionResult> GetInventory(string gameId)
        {
            var available = await _gameKeyRepository.CountAvailableByGameAsync(gameId);
            var assigned = await _gameKeyRepository.CountAssignedByGameAsync(gameId);
            return Ok(new { gameId, available, assigned });
        }

        // Залить ключи в пул игры (B). Тело: { keyType, keys: [...] }.
        [HttpPost("inventory/{gameId}")]
        public async Task<IActionResult> AddToInventory(string gameId, [FromBody] AddPoolKeysRequest request)
        {
            if (request?.Keys == null || request.Keys.Count == 0)
            {
                return BadRequest(new { message = "Список ключей пуст." });
            }

            await _gameKeyRepository.AddPoolKeysAsync(gameId, request.KeyType, request.Keys);
            var available = await _gameKeyRepository.CountAvailableByGameAsync(gameId);
            return Ok(new { gameId, added = request.Keys.Count, available });
        }

        // Выдать ключ пользователю (тест/поддержка) — через ту же логику dispense (B→A).
        [HttpPost("grant")]
        public async Task<IActionResult> Grant([FromBody] GrantKeyRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.GameId) || string.IsNullOrWhiteSpace(request.UserId))
            {
                return BadRequest(new { message = "Нужны gameId и userId." });
            }

            var key = await _fulfillment.DispenseAsync(request.GameId, request.UserId, request.KeyType);
            if (key == null)
            {
                return Ok(new { granted = false, message = "Нет доступного ключа (пул пуст и режим не Demo)." });
            }

            return Ok(new { granted = true, key = key.Key, keyType = key.KeyType });
        }
    }

    public class AddPoolKeysRequest
    {
        public string KeyType { get; set; } = "CD Key";
        public List<string> Keys { get; set; } = new();
    }

    public class GrantKeyRequest
    {
        public string GameId { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string? KeyType { get; set; }
    }
}
