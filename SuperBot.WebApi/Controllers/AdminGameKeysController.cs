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
                    // Порог у игры в приоритете: у хита продаж «мало» — это пятьдесят, у нишевой — два.
                    var threshold = g.LowStockThreshold ?? lowThreshold;
                    return new
                    {
                        gameId = g.Id,
                        title = string.IsNullOrWhiteSpace(g.Title) ? g.Name : g.Title,
                        available,
                        delivered,
                        voided = s?.Voided ?? 0,
                        awaiting,
                        outOfStock = available == 0,
                        low = available > 0 && available <= threshold,
                        lowThreshold = threshold
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
            var addResult = await _gameKeyRepository.AddPoolKeysAsync(gameId, request.KeyType, request.Keys, Actor());

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

            var key = await _fulfillment.DispenseAsync(request.GameId, request.UserId, request.KeyType, Actor());
            if (key == null)
            {
                return Ok(new { granted = false, message = "Нет доступного ключа (пул пуст)." });
            }

            return Ok(new { granted = true, key = key.Key, keyType = key.KeyType });
        }
        // Импорт из файла/буфера с предпросмотром. Тело — текст как есть: по ключу в строке, либо
        // CSV/TSV, где первая колонка — ключ, вторая (необязательно) — тип. Заголовок вроде
        // «key,type» распознаётся и пропускается. dryRun=true — только отчёт, ничего не пишется.
        [HttpPost("inventory/{gameId}/import")]
        public async Task<IActionResult> Import(string gameId, [FromBody] ImportKeysRequest request)
        {
            if (request is null || string.IsNullOrWhiteSpace(request.Content))
            {
                return BadRequest(new { message = "Файл пуст." });
            }

            var parsed = KeyImportParser.Parse(request.Content, request.KeyType);
            var byType = parsed.Keys.GroupBy(k => k.KeyType).ToList();

            if (parsed.Keys.Count == 0 || request.DryRun)
            {
                var preview = parsed.Keys.Count == 0
                    ? new SuperBot.Core.Interfaces.IRepositories.AddPoolKeysResult(0, 0, 0)
                    : await _gameKeyRepository.PreviewPoolKeysAsync(gameId, parsed.Keys.Select(k => k.Key));
                return Ok(ImportReport(true, parsed, byType, preview.Added, preview.SkippedDuplicates, preview.PreviouslyVoided, 0, 0));
            }

            var actor = Actor();
            int added = 0, duplicates = 0, voided = 0;
            foreach (var group in byType)
            {
                var result = await _gameKeyRepository.AddPoolKeysAsync(gameId, group.Key, group.Select(k => k.Key), actor);
                added += result.Added;
                duplicates += result.SkippedDuplicates;
                voided += result.PreviouslyVoided;
            }

            var backfilled = added > 0 ? await BackfillAndMailAsync(gameId) : 0;
            return Ok(ImportReport(false, parsed, byType, added, duplicates, voided, added, backfilled));
        }

        private static object ImportReport(bool dryRun, KeyImportParser.ParseResult parsed, IEnumerable<IGrouping<string, KeyImportParser.ParsedKey>> byType,
            int wouldAdd, int duplicates, int previouslyVoided, int added, int backfilledOrders) => new
        {
            dryRun,
            lines = parsed.TotalLines,
            parsed = parsed.Keys.Count,
            invalid = parsed.Invalid.Count,
            invalidSamples = parsed.Invalid.Take(5),
            types = byType.Select(g => new { keyType = g.Key, count = g.Count() }),
            wouldAdd,
            duplicates,
            previouslyVoided,
            added,
            backfilledOrders
        };

        // Порог «мало ключей» для конкретной игры. null — вернуться к общему.
        [HttpPut("inventory/{gameId}/threshold")]
        public async Task<IActionResult> SetThreshold(string gameId, [FromBody] SetThresholdRequest request)
        {
            var game = await _games.GetByIdAsync(gameId);
            if (game is null)
            {
                return NotFound();
            }
            if (request?.LowStockThreshold is < 0)
            {
                return BadRequest(new { message = "Порог не может быть отрицательным." });
            }

            game.LowStockThreshold = request?.LowStockThreshold;
            await _games.UpdateAsync(gameId, game);
            return Ok(new { gameId, lowStockThreshold = game.LowStockThreshold });
        }

        private string Actor() =>
            User.FindFirst("email")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value
            ?? User.Identity?.Name
            ?? "admin";

        // Довыдача по заказам, ждавшим ключей, плюс письма покупателям — то же, что делает
        // AddToInventory после заливки; вынесено, чтобы импорт вёл себя одинаково.
        private async Task<int> BackfillAndMailAsync(string gameId)
        {
            var backfilled = await _fulfillment.BackfillGameAsync(gameId);
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
                    _logger.LogError(ex, "Backfill keys email failed for order {OrderId} ({Email}).", delivery.Order.Id, delivery.Order.UserId);
                }
            }
            return backfilled.Count;
        }
    }

    public class ImportKeysRequest
    {
        public string Content { get; set; } = string.Empty;
        /// <summary>Тип по умолчанию для строк без второй колонки.</summary>
        public string KeyType { get; set; } = "CD Key";
        public bool DryRun { get; set; } = true;
    }

    public class SetThresholdRequest
    {
        public int? LowStockThreshold { get; set; }
    }

    /// <summary>
    /// Разбор текста импорта ключей. Правила намеренно простые и предсказуемые: по ключу в
    /// строке; разделители , ; или табуляция — первая колонка ключ, вторая тип; строки с # —
    /// комментарии; заголовок вида «key» распознаётся по отсутствию цифр и слову key.
    /// </summary>
    public static class KeyImportParser
    {
        public sealed record ParsedKey(string Key, string KeyType);
        public sealed record ParseResult(List<ParsedKey> Keys, List<string> Invalid, int TotalLines);

        private static readonly char[] Separators = { ',', ';', '\t' };
        private const int MinKeyLength = 5;

        public static ParseResult Parse(string content, string defaultType)
        {
            var type = string.IsNullOrWhiteSpace(defaultType) ? "CD Key" : defaultType.Trim();
            var keys = new List<ParsedKey>();
            var invalid = new List<string>();
            var lines = content.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
            var total = 0;
            var firstContentLine = Array.FindIndex(lines, l => l.Trim().TrimStart('﻿').Length > 0);

            for (var i = 0; i < lines.Length; i++)
            {
                var raw = lines[i].Trim().TrimStart('﻿');
                if (raw.Length == 0 || raw.StartsWith('#'))
                {
                    continue;
                }

                string key, keyType = type;
                var sep = raw.IndexOfAny(Separators);
                if (sep >= 0)
                {
                    key = raw[..sep].Trim().Trim('"');
                    var second = raw[(sep + 1)..].Split(Separators, 2)[0].Trim().Trim('"');
                    if (second.Length > 0)
                    {
                        keyType = second;
                    }
                }
                else
                {
                    key = raw.Trim('"');
                }

                // Заголовок CSV: первая непустая строка, в ключе слово «key» и нет цифр.
                if (i == firstContentLine && key.Contains("key", StringComparison.OrdinalIgnoreCase) && !key.Any(char.IsDigit))
                {
                    continue;
                }

                total++;
                if (key.Length < MinKeyLength || key.Any(char.IsWhiteSpace))
                {
                    invalid.Add(raw.Length > 60 ? raw[..60] + "…" : raw);
                    continue;
                }

                keys.Add(new ParsedKey(key, keyType));
            }

            return new ParseResult(keys, invalid, total);
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
