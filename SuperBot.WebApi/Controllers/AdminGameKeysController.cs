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
        private readonly IGameRepository _games;
        private readonly IOrderRepository _orders;
        private readonly IKeyFulfillmentService _fulfillment;
        private readonly IDeliveryMailer _deliveryMailer;
        private readonly ILogger<AdminGameKeysController> _logger;

        public AdminGameKeysController(
            IGameKeyRepository gameKeyRepository,
            IGameRepository games,
            IOrderRepository orders,
            IKeyFulfillmentService fulfillment,
            IDeliveryMailer deliveryMailer,
            ILogger<AdminGameKeysController> logger)
        {
            _gameKeyRepository = gameKeyRepository;
            _games = games;
            _orders = orders;
            _fulfillment = fulfillment;
            _deliveryMailer = deliveryMailer;
            _logger = logger;
        }

        // Обзор запасов ключей по ВСЕМ играм: остаток/выдано/изъято, кто заканчивается/пуст. lowThreshold — порог «мало».
        [HttpGet("overview")]
        public async Task<IActionResult> Overview([FromQuery] int lowThreshold = 5)
        {
            if (lowThreshold < 0)
            {
                lowThreshold = 0;
            }

            var stats = (await _gameKeyRepository.GetInventorySummaryAsync())
                .ToDictionary(s => s.GameId, StringComparer.OrdinalIgnoreCase);
            // Сколько ключей «должны» по игре: оплатили, а ключа не было (готовы к выдаче, но не закрыты).
            var owed = await _orders.GetOwedKeyCountByGameAsync();
            var allGames = await _games.GetAllAsync();

            var rows = allGames
                .Where(g => !string.IsNullOrWhiteSpace(g.Id))
                .Select(g =>
                {
                    stats.TryGetValue(g.Id!, out var s);
                    var available = s?.Available ?? 0;
                    var delivered = s?.Delivered ?? 0;
                    var awaiting = owed.TryGetValue(g.Id!, out var owe) ? owe : 0;
                    return new
                    {
                        gameId = g.Id,
                        title = string.IsNullOrWhiteSpace(g.Title) ? g.Name : g.Title,
                        available,
                        delivered,
                        voided = s?.Voided ?? 0,
                        awaiting,
                        outOfStock = available == 0,
                        low = available > 0 && available <= lowThreshold
                    };
                })
                // Сначала где ЖДУТ ключа (клиент заплатил), затем пустые/продаваемые, «мало», по остатку.
                .OrderByDescending(r => r.awaiting)
                .ThenBy(r => r.available)
                .ThenByDescending(r => r.delivered)
                .ToList();

            var totals = new
            {
                games = rows.Count,
                available = rows.Sum(r => r.available),
                delivered = rows.Sum(r => r.delivered),
                awaiting = rows.Sum(r => r.awaiting),
                outOfStock = rows.Count(r => r.outOfStock),
                lowStock = rows.Count(r => r.low)
            };

            return Ok(new { totals, lowThreshold, games = rows });
        }

        // Кто именно ждёт ключи: список позиций заказов с дефицитом (номер заказа, почта, игра, сколько ждут).
        [HttpGet("owed")]
        public async Task<IActionResult> Owed()
        {
            var lines = await _orders.GetOwedKeyOrdersAsync();
            var titleById = (await _games.GetAllAsync())
                .Where(g => !string.IsNullOrWhiteSpace(g.Id))
                .ToDictionary(g => g.Id!, g => string.IsNullOrWhiteSpace(g.Title) ? g.Name : g.Title, StringComparer.OrdinalIgnoreCase);

            var items = lines.Select(l => new
            {
                orderNumber = l.OrderNumber,
                buyerEmail = l.BuyerEmail,
                gameId = l.GameId,
                gameTitle = titleById.TryGetValue(l.GameId, out var t) ? t : l.GameId,
                remaining = l.Remaining,
                createdAt = l.CreatedAt
            }).ToList();

            return Ok(new { total = items.Sum(i => i.remaining), lines = items });
        }

        // Счётчики пула по игре: сколько доступно (не выдано) и сколько выдано.
        [HttpGet("inventory/{gameId}")]
        public async Task<IActionResult> GetInventory(string gameId)
        {
            var available = await _gameKeyRepository.CountAvailableByGameAsync(gameId);
            var assigned = await _gameKeyRepository.CountAssignedByGameAsync(gameId);
            return Ok(new { gameId, available, assigned });
        }

        // Список/поиск ключей игры (B): пагинация, фильтр статуса, поиск по подстроке ключа/email покупателя.
        // Выданные ключи маскируются (last-4) — см. GameKeyListItem.
        [HttpGet("inventory/{gameId}/list")]
        public async Task<IActionResult> ListKeys(
            string gameId,
            [FromQuery] string? query,
            [FromQuery] string? status,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 25)
        {
            var result = await _gameKeyRepository.GetKeysPagedAsync(gameId, query, status, page, pageSize);
            return Ok(new { items = result.Items, total = result.Total, page, pageSize });
        }

        // Залить ключи в пул игры (B). Тело: { keyType, keys: [...] }.
        [HttpPost("inventory/{gameId}")]
        public async Task<IActionResult> AddToInventory(string gameId, [FromBody] AddPoolKeysRequest request)
        {
            if (request?.Keys == null || request.Keys.Count == 0)
            {
                return BadRequest(new { message = "Список ключей пуст." });
            }

            // Дубли/повторы (по хешу, в рамках игры) не заливаются повторно — вернём счётчики админке.
            var addResult = await _gameKeyRepository.AddPoolKeysAsync(gameId, request.KeyType, request.Keys);

            // Довыдаём ключи по оплаченным заказам, ждавшим пополнения пула — только если реально что-то добавили.
            // (Гостей с неподтверждённой почтой выдача пропустит сама — гейт внутри.)
            var backfilled = addResult.Added > 0
                ? await _fulfillment.BackfillGameAsync(gameId)
                : (IReadOnlyList<SuperBot.Core.Interfaces.OrderKeysDelivered>)System.Array.Empty<SuperBot.Core.Interfaces.OrderKeysDelivered>();

            // Раньше бэкфилл раздавал ключи МОЛЧА: заказ закрывался, а покупатель (особенно гость,
            // у которого нет кабинета) об этом не узнавал. Теперь ключи уходят письмом.
            foreach (var delivery in backfilled)
            {
                if (!delivery.Order.UserId.Contains('@') || delivery.Keys.Count == 0)
                {
                    continue;
                }

                try
                {
                    await _deliveryMailer.SendGameKeysAsync(
                        delivery.Order.UserId,
                        delivery.Order.OrderNumber ?? delivery.Order.Id.ToString(),
                        delivery.Keys,
                        SuperBot.Core.Interfaces.KeyDeliveryReceipt.FromOrder(delivery.Order),
                        SuperBot.Core.Interfaces.KeyDeliveryProgress.FromOrder(delivery.Order));
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Backfill keys email failed for order {OrderId} ({Email}).",
                        delivery.Order.Id, delivery.Order.UserId);
                }
            }

            var available = await _gameKeyRepository.CountAvailableByGameAsync(gameId);
            return Ok(new
            {
                gameId,
                added = addResult.Added,
                skippedDuplicates = addResult.SkippedDuplicates,
                previouslyVoided = addResult.PreviouslyVoided,
                available,
                backfilledOrders = backfilled.Count
            });
        }

        // Мягко изъять пуловый ключ (опечатка/мусор): уходит из пула, остаётся в истории, plaintext стирается.
        [HttpPost("inventory/{gameId}/keys/{keyId}/void")]
        public async Task<IActionResult> VoidKey(string gameId, string keyId)
        {
            var ok = await _gameKeyRepository.VoidPoolKeyAsync(gameId, keyId);
            return ok ? Ok(new { voided = true }) : NotFound(new { message = "Ключ не найден или не в пуле." });
        }

        // Жёстко удалить пуловый/изъятый ключ — освобождает значение для повторной заливки. Выданные не трогает.
        [HttpDelete("inventory/{gameId}/keys/{keyId}")]
        public async Task<IActionResult> PurgeKey(string gameId, string keyId)
        {
            var ok = await _gameKeyRepository.PurgeKeyAsync(gameId, keyId);
            return ok ? Ok(new { purged = true }) : NotFound(new { message = "Ключ не найден или уже выдан." });
        }

        // Править пуловый ключ (значение и/или тип). Тело: { key?, keyType? }.
        [HttpPut("inventory/{gameId}/keys/{keyId}")]
        public async Task<IActionResult> EditKey(string gameId, string keyId, [FromBody] EditKeyRequest request)
        {
            var outcome = await _gameKeyRepository.EditPoolKeyAsync(gameId, keyId, request?.Key, request?.KeyType);
            return outcome switch
            {
                EditKeyOutcome.Ok => Ok(new { edited = true }),
                EditKeyOutcome.DuplicateActive => Conflict(new { message = "Такой ключ уже есть активным у этой игры." }),
                _ => NotFound(new { message = "Ключ не найден или его нельзя править (выдан/изъят)." })
            };
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
                return Ok(new { granted = false, message = "Нет доступного ключа (пул пуст)." });
            }

            return Ok(new { granted = true, key = key.Key, keyType = key.KeyType });
        }
    }

    public class AddPoolKeysRequest
    {
        public string KeyType { get; set; } = "CD Key";
        public List<string> Keys { get; set; } = new();
    }

    public class EditKeyRequest
    {
        public string? Key { get; set; }
        public string? KeyType { get; set; }
    }

    public class GrantKeyRequest
    {
        public string GameId { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string? KeyType { get; set; }
    }
}
