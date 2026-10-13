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
        private readonly IGameRepository _games;
        private readonly SuperBot.Core.Regions.IRegionCatalogProvider _regions;

        public GameKeyMongoDbRepository(IMongoDatabase database, IGameRepository games, SuperBot.Core.Regions.IRegionCatalogProvider regions)
        {
            _gameKeys = database.GetCollection<GameKeyDb>(CollectionName);
            _games = games;
            _regions = regions;
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

        public async Task<AddPoolKeysResult> AddPoolKeysAsync(string gameId, string keyType, IEnumerable<string> keys, string? addedBy = null, string? editionCode = null, SuperBot.Core.Regions.RegionPolicy? regionPolicy = null, KeyBatchCost? cost = null)
        {
            var normalizedType = string.IsNullOrWhiteSpace(keyType) ? DefaultKeyType : keyType.Trim();
            var normalizedEdition = string.IsNullOrWhiteSpace(editionCode) ? null : editionCode.Trim();
            var normalizedPolicy = regionPolicy?.Normalize();

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
                    AddedBy = string.IsNullOrWhiteSpace(addedBy) ? null : addedBy,
                    EditionCode = normalizedEdition,
                    RegionPolicy = normalizedPolicy,
                    // Себестоимость проставляется каждому ключу партии: цена закупки должна
                    // остаться при нём и через год, когда та же игра будет куплена по другой.
                    UnitCost = cost?.UnitCost,
                    CostCurrency = cost is null ? null : cost.Currency,
                    Supplier = string.IsNullOrWhiteSpace(cost?.Supplier) ? null : cost!.Supplier!.Trim(),
                    BatchId = cost?.BatchId,
                    AcquiredAtUtc = cost is null ? null : DateTime.UtcNow
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
        /// <summary>
        /// Ключи без закупочной цены, сгруппированные так, как их заливали.
        ///
        /// Считается в памяти, а не агрегацией: день заливки старых ключей берётся из ObjectId,
        /// а его в конвейере Mongo типизированно не достать. Выборка здесь одноразовая — это
        /// список того, что осталось починить, и он убывает по мере проставления цен.
        /// </summary>
        public async Task<IReadOnlyList<KeyCostGroup>> ListKeysWithoutCostAsync()
        {
            var docs = await _gameKeys
                .Find(Builders<GameKeyDb>.Filter.Eq(k => k.UnitCost, null))
                .Project(k => new { k.Id, k.GameId, k.BatchId, k.KeyType, k.EditionCode, k.UserId, k.Voided })
                .ToListAsync();

            return docs
                .GroupBy(d => new
                {
                    d.GameId,
                    d.BatchId,
                    // День заведения записи: для старых ключей это единственный след партии.
                    UploadedOn = ObjectId.Parse(d.Id).CreationTime.Date,
                    d.KeyType,
                    EditionCode = d.EditionCode ?? string.Empty
                })
                .Select(g => new KeyCostGroup(
                    g.Key.GameId,
                    g.Key.BatchId,
                    g.Key.UploadedOn,
                    g.Key.KeyType,
                    string.IsNullOrEmpty(g.Key.EditionCode) ? null : g.Key.EditionCode,
                    g.Count(),
                    g.Count(d => string.IsNullOrEmpty(d.UserId) && !d.Voided),
                    g.Count(d => !string.IsNullOrEmpty(d.UserId)),
                    g.Count(d => d.Voided)))
                .OrderBy(g => g.UploadedOn)
                .ThenByDescending(g => g.Keys)
                .ToList();
        }

        public async Task<KeyCostBackfillResult> BackfillCostAsync(KeyCostBackfillTarget target, KeyBatchCost cost, bool dryRun)
        {
            var filters = new List<FilterDefinition<GameKeyDb>>
            {
                Builders<GameKeyDb>.Filter.Eq(k => k.GameId, target.GameId),
                // Только пустые: проставление восстанавливает недостающее, а не переписывает
                // уже заведённые цены — иначе одна опечатка стёрла бы настоящую закупку.
                Builders<GameKeyDb>.Filter.Eq(k => k.UnitCost, null)
            };

            if (!string.IsNullOrWhiteSpace(target.BatchId))
            {
                filters.Add(Builders<GameKeyDb>.Filter.Eq(k => k.BatchId, target.BatchId));
            }
            if (!string.IsNullOrWhiteSpace(target.KeyType))
            {
                filters.Add(Builders<GameKeyDb>.Filter.Eq(k => k.KeyType, target.KeyType));
            }
            if (!string.IsNullOrWhiteSpace(target.EditionCode))
            {
                filters.Add(Builders<GameKeyDb>.Filter.Eq(k => k.EditionCode, target.EditionCode));
            }
            if (target.UploadedOn is { } day)
            {
                // Сутки по времени создания записи: границы задаём диапазоном ObjectId —
                // отдельного поля с датой заливки у старых ключей нет.
                filters.Add(Builders<GameKeyDb>.Filter.Gte(k => k.Id, ObjectIdBound(day.Date)));
                filters.Add(Builders<GameKeyDb>.Filter.Lt(k => k.Id, ObjectIdBound(day.Date.AddDays(1))));
            }

            var filter = Builders<GameKeyDb>.Filter.And(filters);

            // Порядок — по заведению: «первые 20 из этой партии» должно означать одно и то же
            // при повторном применении, иначе вторая цена ляжет вперемешку с первой.
            var ids = await _gameKeys.Find(filter)
                .Sort(Builders<GameKeyDb>.Sort.Ascending(k => k.Id))
                .Limit(target.Limit)
                .Project(k => k.Id)
                .ToListAsync();

            if (dryRun || ids.Count == 0)
            {
                return new KeyCostBackfillResult(ids.Count, 0, dryRun);
            }

            var update = Builders<GameKeyDb>.Update
                .Set(k => k.UnitCost, cost.UnitCost)
                .Set(k => k.CostCurrency, cost.Currency)
                .Set(k => k.Supplier, string.IsNullOrWhiteSpace(cost.Supplier) ? null : cost.Supplier.Trim())
                .Set(k => k.BatchId, cost.BatchId);

            var result = await _gameKeys.UpdateManyAsync(Builders<GameKeyDb>.Filter.In(k => k.Id, ids), update);
            return new KeyCostBackfillResult(ids.Count, (int)result.ModifiedCount, false);
        }

        /// <summary>
        /// Начало суток как ObjectId: первые 4 байта — секунды эпохи, остальные восемь нули.
        /// Готового ObjectId.GenerateNewId(время) здесь мало: он заполняет хвост машиной и
        /// счётчиком, и запись, созданная в ту же секунду, могла бы не попасть в диапазон.
        /// </summary>
        private static string ObjectIdBound(DateTime at)
        {
            var seconds = (int)(at.ToUniversalTime() - DateTime.UnixEpoch).TotalSeconds;
            return seconds.ToString("x8") + "0000000000000000";
        }

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
                    d.IssuedBy,
                    d.EditionCode,
                    d.RegionPolicy is null ? null : Summarize(d.RegionPolicy),
                    d.UnitCost,
                    d.CostCurrency,
                    d.Supplier,
                    d.BatchId);
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

        public async Task<IReadOnlyList<KeyUsageStat>> GetKeyUsageAsync(DateTime fromUtc)
        {
            // Только выданные и только за окно: расход — это факт выдачи, а не наличие на складе.
            var filter = Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Ne(k => k.UserId, string.Empty),
                Builders<GameKeyDb>.Filter.Gte(k => k.IssuedAt, fromUtc));

            var docs = await _gameKeys.Find(filter)
                .Project(k => new { k.GameId, k.RegionPolicy, k.IssuedAt })
                .ToListAsync();

            // Свернуть по дням проще здесь: окно короткое, и выдач за него столько же, сколько
            // продаж, — это не тот объём, ради которого стоит писать сырую агрегацию с $dateTrunc.
            return docs
                // Группируем и по политике: у одной игры в один день могут уйти ключи из разных
                // партий, и слить их в одну строку значило бы приписать расход чужой области.
                // Ключ группы — устойчивая подпись политики: сам объект сравнивался бы по ссылке.
                .GroupBy(doc => new
                {
                    doc.GameId,
                    Day = doc.IssuedAt.Date,
                    Offer = SuperBot.Core.Regions.RegionOffer.KeyOf(doc.RegionPolicy)
                })
                .Select(group => new KeyUsageStat(
                    group.Key.GameId ?? string.Empty,
                    group.First().RegionPolicy,
                    group.Key.Day,
                    group.Count()))
                .ToList();
        }

        /// <summary>
        /// Изъятый и никому не выданный ключ не попадает ни в остаток, ни в выдачи — считать его
        /// незачем. Отсекаем такие сразу: на большом складе это заметная часть коллекции.
        /// </summary>
        private static FilterDefinition<GameKeyDb> CountableKeys() =>
            Builders<GameKeyDb>.Filter.Or(
                Builders<GameKeyDb>.Filter.Ne(k => k.Voided, true),
                Builders<GameKeyDb>.Filter.Ne(k => k.UserId, string.Empty));

        public async Task<IReadOnlyList<GameRegionStockStat>> GetRegionStockAsync(int limit)
        {
            // Сортировка и ограничение — в базе: наружу выходит верхушка, а не строка на игру.
            var grouped = await _gameKeys.Aggregate()
                .Match(CountableKeys())
                .Group(
                    key => new { key.GameId, key.RegionPolicy },
                    group => new
                    {
                        group.Key,
                        Available = group.Sum(k => k.UserId == string.Empty && !k.Voided ? 1 : 0),
                        Delivered = group.Sum(k => k.UserId != string.Empty ? 1 : 0)
                    })
                // Сначала пустые (их и пополняют), затем самые продаваемые.
                .SortBy(row => row.Available)
                .ThenByDescending(row => row.Delivered)
                .Limit(Math.Max(1, limit))
                .ToListAsync();

            return grouped
                .Select(row => new GameRegionStockStat(
                    row.Key.GameId ?? string.Empty,
                    row.Key.RegionPolicy,
                    row.Available,
                    row.Delivered))
                .ToList();
        }

        public async Task<IReadOnlyList<GameRegionStockStat>> GetRegionStockForGamesAsync(IReadOnlyCollection<string> gameIds)
        {
            var ids = (gameIds ?? Array.Empty<string>())
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (ids.Count == 0)
            {
                return Array.Empty<GameRegionStockStat>();
            }

            var grouped = await _gameKeys.Aggregate()
                .Match(Builders<GameKeyDb>.Filter.And(
                    Builders<GameKeyDb>.Filter.In(k => k.GameId, ids),
                    CountableKeys()))
                .Group(
                    key => new { key.GameId, key.RegionPolicy },
                    group => new
                    {
                        group.Key,
                        Available = group.Sum(k => k.UserId == string.Empty && !k.Voided ? 1 : 0),
                        Delivered = group.Sum(k => k.UserId != string.Empty ? 1 : 0)
                    })
                .ToListAsync();

            return grouped
                .Select(row => new GameRegionStockStat(
                    row.Key.GameId ?? string.Empty,
                    row.Key.RegionPolicy,
                    row.Available,
                    row.Delivered))
                .ToList();
        }

        public async Task<IReadOnlyList<RegionTotalsStat>> GetRegionTotalsAsync(IReadOnlyCollection<string> gamesWithOwnPolicy)
        {
            var special = (gamesWithOwnPolicy ?? Array.Empty<string>())
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            // Оба свёртывания — в базе. Первое считает по игре и партии (иначе не отличить «две
            // игры по одному ключу» от «одной игры с двумя»), второе сворачивает по области.
            // Игра остаётся в ключе только там, где область зависит от политики самой игры, —
            // так число строк на выходе не зависит от размера каталога.
            var totals = await _gameKeys.Aggregate()
                .Match(CountableKeys())
                .Group(
                    key => new { key.GameId, key.RegionPolicy },
                    group => new
                    {
                        group.Key,
                        Available = group.Sum(k => k.UserId == string.Empty && !k.Voided ? 1 : 0),
                        Delivered = group.Sum(k => k.UserId != string.Empty ? 1 : 0)
                    })
                .Group(
                    row => new
                    {
                        row.Key.RegionPolicy,
                        GameId = special.Contains(row.Key.GameId) ? row.Key.GameId : null
                    },
                    group => new
                    {
                        group.Key,
                        Available = group.Sum(row => row.Available),
                        Delivered = group.Sum(row => row.Delivered),
                        GamesInStock = group.Sum(row => row.Available > 0 ? 1 : 0)
                    })
                .ToListAsync();

            return totals
                .Select(row => new RegionTotalsStat(
                    row.Key.RegionPolicy,
                    row.Key.GameId,
                    row.Available,
                    row.Delivered,
                    row.GamesInStock))
                .ToList();
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

        public Task<int> CountAvailableByGameAsync(string gameId, string? editionCode = null) => CountAsync(gameId, assigned: false, editionCode);

        public async Task<IReadOnlyDictionary<string, int>> CountAvailableByEditionAsync(string gameId)
        {
            var filter = Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId),
                Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty),
                Builders<GameKeyDb>.Filter.Ne(k => k.Voided, true));
            var docs = await _gameKeys.Find(filter).Project(k => new { k.EditionCode }).ToListAsync();
            return docs
                .GroupBy(d => d.EditionCode ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);
        }

        public async Task<IReadOnlyDictionary<string, IReadOnlyDictionary<string, int>>> CountAvailableByEditionForGamesAsync(IReadOnlyCollection<string> gameIds)
        {
            var result = new Dictionary<string, IReadOnlyDictionary<string, int>>(StringComparer.OrdinalIgnoreCase);
            if (gameIds.Count == 0)
            {
                return result;
            }

            var grouped = await _gameKeys.AsQueryable()
                .Where(key => gameIds.Contains(key.GameId) && key.UserId == string.Empty && !key.Voided)
                .GroupBy(key => new { key.GameId, key.EditionCode })
                .Select(group => new { group.Key.GameId, group.Key.EditionCode, Total = group.Count() })
                .ToListAsync();

            foreach (var game in grouped.GroupBy(item => item.GameId ?? string.Empty, StringComparer.OrdinalIgnoreCase))
            {
                // null и пустой код — одно и то же базовое издание, их складываем.
                result[game.Key] = game
                    .GroupBy(item => item.EditionCode ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(edition => edition.Key, edition => edition.Sum(item => item.Total), StringComparer.OrdinalIgnoreCase);
            }
            return result;
        }

        /// <summary>Фильтр по изданию: пустой код — ключи без издания (в том числе старые записи без поля).</summary>
        private static FilterDefinition<GameKeyDb> EditionFilter(string? editionCode) =>
            string.IsNullOrWhiteSpace(editionCode)
                ? Builders<GameKeyDb>.Filter.Or(
                    Builders<GameKeyDb>.Filter.Eq(k => k.EditionCode, null),
                    Builders<GameKeyDb>.Filter.Eq(k => k.EditionCode, string.Empty))
                : Builders<GameKeyDb>.Filter.Eq(k => k.EditionCode, editionCode.Trim());

        public Task<int> CountAssignedByGameAsync(string gameId) => CountAsync(gameId, assigned: true, null);

        private async Task<int> CountAsync(string gameId, bool assigned, string? editionCode)
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
            if (editionCode is not null)
            {
                filter &= EditionFilter(editionCode);
            }
            return (int)await _gameKeys.CountDocumentsAsync(filter);
        }

        public async Task<GameKey> TryDispensePoolKeyAsync(string gameId, string userId, string? issuedBy = null, string? editionCode = null, string? buyerCountry = null, string? orderId = null, string? offerKey = null)
        {
            // Страна или выбранный вариант — оба требуют посмотреть на политику каждой партии,
            // а не взять первый попавшийся ключ.
            if (!string.IsNullOrWhiteSpace(buyerCountry) || !string.IsNullOrWhiteSpace(offerKey))
            {
                return await TryDispenseForCountryAsync(gameId, userId, issuedBy, editionCode, buyerCountry, orderId, offerKey);
            }
            // Изъятые (Voided) не выдаём — они «мусор»/история, а не живой пул. Издание — строго:
            // ключ Standard покупателю Deluxe не подходит, и наоборот.
            var filter = Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId),
                Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty),
                Builders<GameKeyDb>.Filter.Ne(k => k.Voided, true),
                EditionFilter(editionCode));
            var update = Builders<GameKeyDb>.Update
                .Set(k => k.UserId, userId)
                .Set(k => k.IssuedAt, DateTime.UtcNow)
                .Set(k => k.IsActive, true)
                .Set(k => k.IssuedBy, string.IsNullOrWhiteSpace(issuedBy) ? null : issuedBy)
                    .Set(k => k.OrderId, string.IsNullOrWhiteSpace(orderId) ? null : orderId);
            var options = new FindOneAndUpdateOptions<GameKeyDb> { ReturnDocument = ReturnDocument.After };
            var updated = await _gameKeys.FindOneAndUpdateAsync(filter, update, options);
            return updated is null ? null : Map(updated);
        }

        /// <summary>
        /// Выдача с учётом страны покупателя и выбранного варианта: из кандидатов пула берётся первый,
        /// который подходит по обоим условиям, и атомарно закрепляется за покупателем. Нет подходящего —
        /// null: «любой» ключ отдавать нельзя, он либо не активируется, либо не тот, за который заплачено.
        ///
        /// Вариант проверяется точным совпадением ключа партии: покупатель платил за конкретную
        /// область активации, и «похожая» партия ему не подходит — у неё другая цена.
        /// </summary>
        private async Task<GameKey> TryDispenseForCountryAsync(string gameId, string userId, string? issuedBy, string? editionCode, string? buyerCountry, string? orderId = null, string? offerKey = null)
        {
            var gamePolicy = (await _games.GetByIdAsync(gameId))?.RegionPolicy ?? SuperBot.Core.Regions.RegionPolicy.Anywhere();
            var catalog = _regions.Current;
            var filter = Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId),
                Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty),
                Builders<GameKeyDb>.Filter.Ne(k => k.Voided, true),
                EditionFilter(editionCode));
            var wantedOffer = string.IsNullOrWhiteSpace(offerKey)
                ? null
                : SuperBot.Core.Regions.RegionOffer.NormalizeKey(offerKey, gamePolicy);
            // Курсором по всему пулу, а не первыми N записями: политика партии проверяется в коде, и
            // жёсткий предел (было 200) оставлял заказ без ключа, когда впереди лежали сотни ключей
            // других партий, а подходящие — дальше. Проекция лёгкая, до первого совпадения читается
            // ровно столько, сколько нужно.
            using var cursor = await _gameKeys.Find(filter).Project(k => new { k.Id, k.RegionPolicy }).ToCursorAsync();
            while (await cursor.MoveNextAsync())
            {
                foreach (var candidate in cursor.Current)
                {
                    var policy = candidate.RegionPolicy ?? gamePolicy;

                    // Вариант считаем по области активации партии — ровно так же, как его считала
                    // витрина, когда показывала цену: партия без своей политики наследует политику игры.
                    if (wantedOffer is not null &&
                        !string.Equals(
                            SuperBot.Core.Regions.RegionOffer.EffectiveKeyOf(candidate.RegionPolicy, gamePolicy),
                            wantedOffer,
                            StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    if (!policy.Allows(buyerCountry, catalog))
                    {
                        continue;
                    }
                    var claim = Builders<GameKeyDb>.Filter.And(
                        Builders<GameKeyDb>.Filter.Eq(k => k.Id, candidate.Id),
                        Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty),
                        Builders<GameKeyDb>.Filter.Ne(k => k.Voided, true));
                    var update = Builders<GameKeyDb>.Update
                        .Set(k => k.UserId, userId)
                        .Set(k => k.IssuedAt, DateTime.UtcNow)
                        .Set(k => k.IsActive, true)
                        .Set(k => k.IssuedBy, string.IsNullOrWhiteSpace(issuedBy) ? null : issuedBy)
                        .Set(k => k.OrderId, string.IsNullOrWhiteSpace(orderId) ? null : orderId);
                    var claimed = await _gameKeys.FindOneAndUpdateAsync(claim, update, new FindOneAndUpdateOptions<GameKeyDb> { ReturnDocument = ReturnDocument.After });
                    if (claimed is not null)
                    {
                        return Map(claimed);
                    }
                }
            }
            return null;
        }

        public async Task<IReadOnlyDictionary<string, KeyActivationInfo>> GetActivationInfoAsync(IReadOnlyCollection<string> gameIds)
        {
            var ids = (gameIds ?? Array.Empty<string>())
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (ids.Count == 0)
            {
                return new Dictionary<string, KeyActivationInfo>(StringComparer.OrdinalIgnoreCase);
            }

            // Считаем только доступные ключи: выданный или изъятый ничего не говорит о том, что
            // покупатель получит сейчас. Одним запросом на всю корзину, а не по игре за раз.
            var filter = Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.In(k => k.GameId, ids),
                Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty),
                Builders<GameKeyDb>.Filter.Ne(k => k.Voided, true));

            // Группируем в базе: наружу выходит по строке на партию, а не на ключ, поэтому
            // ответ не растёт вместе со складом.
            var batches = await _gameKeys.Aggregate()
                .Match(filter)
                .Group(
                    key => new { key.GameId, key.KeyType, key.RegionPolicy },
                    group => new { group.Key, Count = group.Count() })
                .ToListAsync();

            return batches
                .GroupBy(batch => batch.Key.GameId, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    group => group.Key,
                    group => new KeyActivationInfo(
                        group
                            .Select(batch => batch.Key.KeyType?.Trim())
                            .Where(type => !string.IsNullOrWhiteSpace(type))
                            .Select(type => type!)
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .OrderBy(type => type, StringComparer.OrdinalIgnoreCase)
                            .ToList(),
                        group.Sum(batch => batch.Count),
                        group.Select(batch => batch.Key.RegionPolicy).ToList()),
                    StringComparer.OrdinalIgnoreCase);
        }

        public async Task<IReadOnlyList<RegionPoolStat>> CountAvailableByRegionPolicyAsync(string gameId)
        {
            var filter = Builders<GameKeyDb>.Filter.And(
                Builders<GameKeyDb>.Filter.Eq(k => k.GameId, gameId),
                Builders<GameKeyDb>.Filter.Eq(k => k.UserId, string.Empty),
                Builders<GameKeyDb>.Filter.Ne(k => k.Voided, true));
            var docs = await _gameKeys.Find(filter).Project(k => new { k.RegionPolicy, k.EditionCode }).ToListAsync();
            return docs
                .GroupBy(d => (Summary: Summarize(d.RegionPolicy), Edition: d.EditionCode ?? string.Empty))
                .Select(g => new RegionPoolStat(g.Key.Summary, g.First().RegionPolicy, g.Count(), g.Key.Edition))
                .OrderBy(stat => stat.EditionCode).ThenBy(stat => stat.Summary)
                .ToList();
        }

        /// <summary>Короткая подпись политики для админки: «Game default», «Global −RU,BY», «EU,NA −CN».</summary>
        public static string Summarize(SuperBot.Core.Regions.RegionPolicy? policy)
        {
            if (policy is null)
            {
                return "Game default";
            }
            var head = policy.IsGlobal ? "Global" : (policy.Regions.Count > 0 ? string.Join(",", policy.Regions) : "Nowhere");
            return policy.ExcludedCountries.Count > 0 ? $"{head} −{string.Join(",", policy.ExcludedCountries)}" : head;
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
            EditionCode = item.EditionCode,
            RegionPolicy = item.RegionPolicy,
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
