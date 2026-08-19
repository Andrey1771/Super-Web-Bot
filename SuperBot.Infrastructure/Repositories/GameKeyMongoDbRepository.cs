using System.Text.RegularExpressions;
using MongoDB.Bson;
using MongoDB.Driver;
using MongoDB.Driver.Linq;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class GameKeyMongoDbRepository : IGameKeyRepository
    {
        private const string CollectionName = "GameKeys";
        private const string DefaultKeyType = "CD Key";
        private const int DefaultPageSize = 25;
        private const int MaxPageSize = 100;
        /// <summary>Сколько последних символов выданного ключа показываем открытыми при маскировке.</summary>
        private const int MaskVisibleTail = 4;
        /// <summary>Потолок числа точек-маркеров в маске, чтобы длинный ключ не растягивал строку.</summary>
        private const int MaskMaxBullets = 10;

        // Значения фильтра статуса приходят из API (?status=…) — держим строки в одном месте.
        private const string StatusPool = "pool";
        private const string StatusDelivered = "delivered";
        private const string StatusVoided = "voided";

        private readonly IMongoCollection<GameKeyDb> _gameKeys;

        public GameKeyMongoDbRepository(IMongoDatabase database)
        {
            _gameKeys = database.GetCollection<GameKeyDb>(CollectionName);
        }

        public async Task<List<GameKey>> GetByUserAsync(string userId, int limit)
        {
            var items = await _gameKeys
                .Find(key => key.UserId == userId)
                .SortByDescending(key => key.IssuedAt)
                .Limit(limit)
                .ToListAsync();

            return items.Select(Map).ToList();
        }

        public async Task AddAsync(GameKey gameKey)
        {
            await _gameKeys.InsertOneAsync(ToDb(gameKey));
        }

        public async Task<AddPoolKeysResult> AddPoolKeysAsync(string gameId, string keyType, IEnumerable<string> keys, string? addedBy = null)
        {
            var normalizedType = string.IsNullOrWhiteSpace(keyType) ? DefaultKeyType : keyType.Trim();

            // Непустые ключи; SkippedDuplicates = сколько из них НЕ добавили (внутрибатчевые дубли + уже существующие).
            var submitted = (keys ?? Enumerable.Empty<string>())
                .Select(k => k?.Trim())
                .Where(k => !string.IsNullOrWhiteSpace(k))
                .ToList();

            if (submitted.Count == 0)
            {
                return new AddPoolKeysResult(0, 0, 0);
            }

            // Дедуп внутри самого батча по хешу (сохраняя порядок): один и тот же ключ дважды в поле ввода.
            var seen = new HashSet<string>();
            var candidates = new List<(string Key, string Hash)>();
            foreach (var key in submitted)
            {
                var hash = GameKeyHash.Compute(key);
                if (seen.Add(hash))
                {
                    candidates.Add((key!, hash));
                }
            }

            // Существующие записи этой игры по хешам кандидатов, с признаком «изъят».
            var existing = await _gameKeys
                .Find(Builders<GameKeyDb>.Filter.And(
                    Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId),
                    Builders<GameKeyDb>.Filter.In(k => k.KeyHash, candidates.Select(c => c.Hash))))
                .Project(k => new { k.KeyHash, k.Voided })
                .ToListAsync();

            // Активный дубль (пул/выдан) → пропускаем. Только изъятый в истории → добавляем, но ПРЕДУПРЕЖДАЕМ.
            var activeHashes = existing.Where(e => !e.Voided).Select(e => e.KeyHash).ToHashSet();
            var voidedHashes = existing.Where(e => e.Voided).Select(e => e.KeyHash).ToHashSet();

            var toInsert = new List<(string Key, string Hash)>();
            var previouslyVoided = 0;
            foreach (var candidate in candidates)
            {
                if (activeHashes.Contains(candidate.Hash))
                {
                    continue; // уже есть активным — не плодим
                }
                if (voidedHashes.Contains(candidate.Hash))
                {
                    previouslyVoided++; // такое значение раньше изымали — заливаем, но подсветим
                }
                toInsert.Add(candidate);
            }

            var added = 0;
            if (toInsert.Count > 0)
            {
                var docs = toInsert.Select(c => new GameKeyDb
                {
                    UserId = string.Empty, // не назначен — лежит в пуле
                    GameId = gameId,
                    Key = c.Key,
                    KeyHash = c.Hash,
                    KeyType = normalizedType,
                    IssuedAt = default,
                    IsActive = false,
                    Voided = false,
                    AddedBy = string.IsNullOrWhiteSpace(addedBy) ? null : addedBy
                }).ToList();

                try
                {
                    // Unordered: дубль в середине не останавливает остальные вставки.
                    await _gameKeys.InsertManyAsync(docs, new InsertManyOptions { IsOrdered = false });
                    added = docs.Count;
                }
                catch (MongoBulkWriteException ex)
                {
                    // Гонка с параллельной заливкой: частичный уникальный индекс (по активным) отбил дубли.
                    var dupErrors = ex.WriteErrors.Count(e => e.Category == ServerErrorCategory.DuplicateKey);
                    added = docs.Count - dupErrors;
                }
            }

            return new AddPoolKeysResult(added, submitted.Count - added, previouslyVoided);
        }

        /// <summary>
        /// Предпросмотр заливки: те же правила дедупа (внутри батча по хешу; активный дубль в базе —
        /// пропуск; изъятый раньше — добавится с предупреждением), но без вставки. Нужен, чтобы
        /// показать «добавится N, дублей M» до нажатия «Импортировать».
        /// </summary>
        public async Task<AddPoolKeysResult> PreviewPoolKeysAsync(string gameId, IEnumerable<string> keys)
        {
            var submitted = (keys ?? Enumerable.Empty<string>())
                .Select(k => k?.Trim())
                .Where(k => !string.IsNullOrWhiteSpace(k))
                .ToList();
            if (submitted.Count == 0)
            {
                return new AddPoolKeysResult(0, 0, 0);
            }

            var seen = new HashSet<string>();
            var hashes = new List<string>();
            foreach (var key in submitted)
            {
                var hash = GameKeyHash.Compute(key!);
                if (seen.Add(hash))
                {
                    hashes.Add(hash);
                }
            }

            var existing = await _gameKeys
                .Find(Builders<GameKeyDb>.Filter.And(
                    Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId),
                    Builders<GameKeyDb>.Filter.In(k => k.KeyHash, hashes)))
                .Project(k => new { k.KeyHash, k.Voided })
                .ToListAsync();

            var active = existing.Where(e => !e.Voided).Select(e => e.KeyHash).ToHashSet();
            var voided = existing.Where(e => e.Voided).Select(e => e.KeyHash).ToHashSet();

            var wouldAdd = hashes.Count(h => !active.Contains(h));
            var previouslyVoided = hashes.Count(h => !active.Contains(h) && voided.Contains(h));
            return new AddPoolKeysResult(wouldAdd, submitted.Count - wouldAdd, previouslyVoided);
        }

        public async Task<GameKeyPage> GetKeysPagedAsync(string gameId, string? query, string? status, int page, int pageSize)
        {
            page = page < 1 ? 1 : page;
            pageSize = pageSize is < 1 or > MaxPageSize ? DefaultPageSize : pageSize;

            var filters = new List<FilterDefinition<GameKeyDb>>
            {
                Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId)
            };

            if (string.Equals(status, StatusPool, StringComparison.OrdinalIgnoreCase))
            {
                // Пул = не выдан И не изъят.
                filters.Add(Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty));
                filters.Add(Builders<GameKeyDb>.Filter.Ne(k => k.Voided, true));
            }
            else if (string.Equals(status, StatusDelivered, StringComparison.OrdinalIgnoreCase))
            {
                filters.Add(Builders<GameKeyDb>.Filter.Ne(k => k.UserId, string.Empty));
            }
            else if (string.Equals(status, StatusVoided, StringComparison.OrdinalIgnoreCase))
            {
                filters.Add(Builders<GameKeyDb>.Filter.Eq(k => k.Voided, true));
            }

            if (!string.IsNullOrWhiteSpace(query))
            {
                var rx = new BsonRegularExpression(Regex.Escape(query.Trim()), "i");
                filters.Add(Builders<GameKeyDb>.Filter.Or(
                    Builders<GameKeyDb>.Filter.Regex(k => k.Key, rx),
                    Builders<GameKeyDb>.Filter.Regex(k => k.UserId, rx)));
            }

            var filter = Builders<GameKeyDb>.Filter.And(filters);
            var total = await _gameKeys.CountDocumentsAsync(filter);

            // Пуловые (UserId пуст) сортируются вперёд, затем выданные/изъятые по дате убыв.
            var sort = Builders<GameKeyDb>.Sort.Ascending(k => k.UserId).Descending(k => k.IssuedAt);
            var docs = await _gameKeys.Find(filter).Sort(sort)
                .Skip((page - 1) * pageSize).Limit(pageSize).ToListAsync();

            var items = docs.Select(d =>
            {
                if (d.Voided)
                {
                    // plaintext стёрт при изъятии — показывать нечего; время = когда изъяли.
                    return new GameKeyListItem(d.Id, "—", true, d.KeyType, "Voided", null, d.VoidedAt);
                }

                var delivered = !string.IsNullOrEmpty(d.UserId);
                return new GameKeyListItem(
                    d.Id,
                    delivered ? MaskKey(d.Key) : d.Key,
                    delivered,
                    d.KeyType,
                    delivered ? "Delivered" : "Pool",
                    delivered ? d.UserId : null,
                    d.IssuedAt == default ? null : d.IssuedAt,
                    d.AddedBy,
                    d.IssuedBy);
            }).ToList();

            return new GameKeyPage(items, total);
        }

        /// <summary>Маскировка выданного ключа: показываем только последние 4 символа.</summary>
        private static string MaskKey(string? key)
        {
            if (string.IsNullOrEmpty(key))
            {
                return string.Empty;
            }
            var k = key.Trim();
            if (k.Length <= MaskVisibleTail)
            {
                return new string('•', k.Length);
            }
            return new string('•', Math.Min(k.Length - MaskVisibleTail, MaskMaxBullets)) + k[^MaskVisibleTail..];
        }

        public async Task<IReadOnlyList<GameKeyInventoryStat>> GetInventorySummaryAsync()
        {
            // Один $group по GameId со счётчиками по статусам. Типизированная LINQ-аггрегация:
            // драйвер сам транслирует ternary/&& в $cond/$and, а Sum — в $sum, поэтому имена полей
            // не хардкодятся строками (в отличие от сырого BsonDocument). available = в пуле
            // (UserId пуст) и не изъят; delivered = выдан; voided = изъят.
            var grouped = await _gameKeys.AsQueryable()
                .GroupBy(k => k.GameId)
                .Select(g => new
                {
                    GameId = g.Key,
                    Available = g.Sum(k => k.UserId == string.Empty && !k.Voided ? 1 : 0),
                    Delivered = g.Sum(k => k.UserId != string.Empty ? 1 : 0),
                    Voided = g.Sum(k => k.Voided ? 1 : 0)
                })
                .ToListAsync();

            return grouped
                .Select(g => new GameKeyInventoryStat(g.GameId ?? string.Empty, g.Available, g.Delivered, g.Voided))
                .ToList();
        }

        public async Task<IReadOnlyList<GameKeyTypeStat>> GetKeyTypeSummaryAsync()
        {
            // Группируем по паре (игра, тип ключа). Изъятые не считаем — их не продать,
            // а вот выданные считаем: игра всё равно продаётся в этом виде.
            var grouped = await _gameKeys.AsQueryable()
                .Where(key => !key.Voided)
                .GroupBy(key => new { key.GameId, key.KeyType })
                .Select(group => new
                {
                    group.Key.GameId,
                    group.Key.KeyType,
                    Total = group.Count()
                })
                .ToListAsync();

            return grouped
                .Select(item => new GameKeyTypeStat(
                    item.GameId ?? string.Empty,
                    item.KeyType ?? string.Empty,
                    item.Total))
                .ToList();
        }

        public Task<int> CountAvailableByGameAsync(string gameId) => CountAsync(gameId, assigned: false);

        public Task<int> CountAssignedByGameAsync(string gameId) => CountAsync(gameId, assigned: true);

        private async Task<int> CountAsync(string gameId, bool assigned)
        {
            var userFilter = assigned
                ? Builders<GameKeyDb>.Filter.Ne(k => k.UserId, string.Empty)
                // Доступный = в пуле И не изъят.
                : Builders<GameKeyDb>.Filter.And(
                    Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty),
                    Builders<GameKeyDb>.Filter.Ne(k => k.Voided, true));
            var filter = Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId),
                userFilter);
            return (int)await _gameKeys.CountDocumentsAsync(filter);
        }

        public async Task<GameKey> TryDispensePoolKeyAsync(string gameId, string userId, string? issuedBy = null)
        {
            // Изъятые (Voided) не выдаём — они «мусор»/история, а не живой пул.
            var filter = Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId),
                Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty),
                Builders<GameKeyDb>.Filter.Ne(k => k.Voided, true));
            var update = Builders<GameKeyDb>.Update
                .Set(k => k.UserId, userId)
                .Set(k => k.IssuedAt, DateTime.UtcNow)
                .Set(k => k.IsActive, true)
                .Set(k => k.IssuedBy, string.IsNullOrWhiteSpace(issuedBy) ? null : issuedBy);
            var options = new FindOneAndUpdateOptions<GameKeyDb> { ReturnDocument = ReturnDocument.After };
            var updated = await _gameKeys.FindOneAndUpdateAsync(filter, update, options);
            return updated is null ? null : Map(updated);
        }

        public async Task<bool> VoidPoolKeyAsync(string gameId, string keyId)
        {
            // Изымаем только ПУЛОВЫЙ (невыданный, ещё не изъятый) ключ: plaintext стираем, KeyHash оставляем.
            var filter = Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Eq(k => k.Id, keyId),
                Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId),
                Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty),
                Builders<GameKeyDb>.Filter.Ne(k => k.Voided, true));
            var update = Builders<GameKeyDb>.Update
                .Set(k => k.Voided, true)
                .Set(k => k.VoidedAt, DateTime.UtcNow)
                .Set(k => k.Key, string.Empty);
            var result = await _gameKeys.UpdateOneAsync(filter, update);
            return result.ModifiedCount > 0;
        }

        public async Task<bool> PurgeKeyAsync(string gameId, string keyId)
        {
            // Жёстко удаляем пуловый или изъятый ключ (освобождает значение). ВЫДАННЫЕ не трогаем.
            var filter = Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Eq(k => k.Id, keyId),
                Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId),
                Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty));
            var result = await _gameKeys.DeleteOneAsync(filter);
            return result.DeletedCount > 0;
        }

        public async Task<EditKeyOutcome> EditPoolKeyAsync(string gameId, string keyId, string? newKey, string? newKeyType)
        {
            var current = await _gameKeys.Find(Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Eq(k => k.Id, keyId),
                Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId))).FirstOrDefaultAsync();

            // Править можно только пуловый (невыданный, не изъятый) ключ.
            if (current == null || !string.IsNullOrEmpty(current.UserId) || current.Voided)
            {
                return EditKeyOutcome.NotEditable;
            }

            var updates = new List<UpdateDefinition<GameKeyDb>>();

            if (!string.IsNullOrWhiteSpace(newKeyType))
            {
                updates.Add(Builders<GameKeyDb>.Update.Set(k => k.KeyType, newKeyType.Trim()));
            }

            var trimmedKey = newKey?.Trim();
            if (!string.IsNullOrWhiteSpace(trimmedKey) && trimmedKey != current.Key)
            {
                var newHash = GameKeyHash.Compute(trimmedKey);
                // Новое значение не должно совпадать с уже АКТИВНЫМ ключом этой игры (кроме самого себя).
                var clash = await _gameKeys.Find(Builders<GameKeyDb>.Filter.And(
                    Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId),
                    Builders<GameKeyDb>.Filter.Eq(k => k.KeyHash, newHash),
                    Builders<GameKeyDb>.Filter.Ne(k => k.Voided, true),
                    Builders<GameKeyDb>.Filter.Ne(k => k.Id, keyId))).AnyAsync();
                if (clash)
                {
                    return EditKeyOutcome.DuplicateActive;
                }
                updates.Add(Builders<GameKeyDb>.Update.Set(k => k.Key, trimmedKey));
                updates.Add(Builders<GameKeyDb>.Update.Set(k => k.KeyHash, newHash));
            }

            if (updates.Count > 0)
            {
                await _gameKeys.UpdateOneAsync(
                    Builders<GameKeyDb>.Filter.Eq(k => k.Id, keyId),
                    Builders<GameKeyDb>.Update.Combine(updates));
            }

            return EditKeyOutcome.Ok;
        }

        private static GameKey Map(GameKeyDb item) => new GameKey
        {
            UserId = item.UserId,
            GameId = item.GameId,
            Key = item.Key,
            KeyType = item.KeyType,
            IssuedAt = item.IssuedAt,
            IsActive = item.IsActive
        };

        private static GameKeyDb ToDb(GameKey k) => new GameKeyDb
        {
            UserId = k.UserId,
            GameId = k.GameId,
            Key = k.Key,
            KeyHash = GameKeyHash.Compute(k.Key),
            KeyType = k.KeyType,
            IssuedAt = k.IssuedAt,
            IsActive = k.IsActive,
            Voided = false
        };
    }
}
