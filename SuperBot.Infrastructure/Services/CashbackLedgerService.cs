using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using SuperBot.Core.Cashback;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>
    /// Журнал кэшбэка на MongoDB.
    ///
    /// Транзакций Mongo в проекте нет, поэтому устройство такое, при котором сбой посередине не
    /// портит деньги: баланс не хранится отдельным числом, а каждый раз считается из записей
    /// журнала (<see cref="CashbackProjection"/>). Повторы событий гасятся уникальным ключом
    /// идемпотентности у каждой записи. Одновременные траты одного покупателя выстраиваются в
    /// очередь через номер версии в <c>CashbackAccounts</c>: проигравший откатывает свою запись
    /// и пересчитывает заново.
    /// </summary>
    public class CashbackLedgerService : ICashbackLedger
    {
        private const int MaxReserveAttempts = 5;

        private readonly IMongoCollection<CashbackEntryDb> _entries;
        private readonly IMongoCollection<CashbackAccountDb> _accounts;
        private readonly IOptionsMonitor<CashbackOptions> _options;
        private readonly ILogger<CashbackLedgerService> _logger;

        public CashbackLedgerService(
            IMongoDatabase database,
            IOptionsMonitor<CashbackOptions> options,
            ILogger<CashbackLedgerService> logger)
        {
            _entries = database.GetCollection<CashbackEntryDb>("CashbackEntries");
            _accounts = database.GetCollection<CashbackAccountDb>("CashbackAccounts");
            _options = options;
            _logger = logger;
        }

        public async Task<CashbackSummary> GetSummaryAsync(string userKey, DateTime? now = null) =>
            CashbackProjection.Project(await LoadAsync(userKey), now ?? DateTime.UtcNow);

        public async Task<IReadOnlyList<CashbackEntry>> GetEntriesAsync(string userKey) =>
            (await LoadAsync(userKey)).OrderByDescending(entry => entry.CreatedAt).ToList();

        public async Task<CashbackEntry?> EarnAsync(CashbackEarnRequest request)
        {
            var options = _options.CurrentValue;
            if (string.IsNullOrWhiteSpace(request.UserKey) || string.IsNullOrWhiteSpace(request.OrderId)
                || request.PaidUsd <= 0 || !options.Enabled)
            {
                return null;
            }

            var key = $"earn:{request.OrderId}";
            var existing = await FindByKeyAsync(key);
            if (existing != null)
            {
                return ToEntry(existing);
            }

            // Уровень — по сумме покупок до этого заказа: сам заказ поднимает уровень только следующим.
            var before = CashbackProjection.Project(await LoadAsync(request.UserKey), request.OrderedAt);
            var tier = options.TierFor(before.QualifyingSpendUsd);
            var amount = CashbackProjection.Round(request.PaidUsd * tier.Percent / 100m);
            if (amount <= 0)
            {
                return null;
            }

            var now = DateTime.UtcNow;
            var entry = new CashbackEntryDb
            {
                UserKey = request.UserKey,
                Type = CashbackEntryTypes.Earn,
                AmountUsd = amount,
                OrderId = request.OrderId,
                OrderNumber = request.OrderNumber,
                GameTitle = request.GameTitle,
                GameCoverUrl = request.GameCoverUrl,
                OrderTotalUsd = CashbackProjection.Round(request.PaidUsd),
                OrderTotal = request.OrderTotal,
                OrderCurrency = request.OrderCurrency,
                Percent = tier.Percent,
                CreatedAt = now,
                UnlocksAt = now.AddDays(Math.Max(0, options.PendingDays)),
                ExpiresAt = ExpiryFrom(now, options),
                IdempotencyKey = key
            };

            if (!await TryInsertAsync(entry))
            {
                return ToEntry((await FindByKeyAsync(key))!);
            }

            await RefreshAccountAsync(request.UserKey);
            return ToEntry(entry);
        }

        public async Task<decimal> ReserveAsync(string userKey, string reference, decimal requestedUsd)
        {
            if (string.IsNullOrWhiteSpace(userKey) || string.IsNullOrWhiteSpace(reference))
            {
                return 0m;
            }

            var key = $"spend:{reference}";
            for (var attempt = 0; attempt < MaxReserveAttempts; attempt++)
            {
                var account = await EnsureAccountAsync(userKey);
                var entries = await LoadAsync(userKey);
                var existing = entries.FirstOrDefault(entry => entry.IdempotencyKey == key);

                if (existing?.Status == CashbackSpendStatuses.Committed)
                {
                    return existing.AmountUsd; // платёж уже прошёл — резерв менять поздно
                }

                var heldByThis = existing?.Status == CashbackSpendStatuses.Reserved ? existing.AmountUsd : 0m;
                var summary = CashbackProjection.Project(entries, DateTime.UtcNow);
                var amount = CashbackProjection.Round(Math.Max(0m, Math.Min(requestedUsd, summary.AvailableUsd + heldByThis)));

                // Ничего не меняется: резерв уже такой (или резерва нет и откладывать нечего).
                if (amount == heldByThis)
                {
                    return amount;
                }

                var previous = existing == null ? null : await FindByKeyAsync(key);
                var now = DateTime.UtcNow;
                if (amount == 0)
                {
                    await _entries.UpdateOneAsync(
                        item => item.IdempotencyKey == key && item.Status == CashbackSpendStatuses.Reserved,
                        Builders<CashbackEntryDb>.Update
                            .Set(item => item.Status, CashbackSpendStatuses.Released)
                            .Set(item => item.UpdatedAt, now));
                }
                else
                {
                    await _entries.UpdateOneAsync(
                        item => item.IdempotencyKey == key,
                        Builders<CashbackEntryDb>.Update
                            .Set(item => item.AmountUsd, amount)
                            .Set(item => item.Status, CashbackSpendStatuses.Reserved)
                            .Set(item => item.UpdatedAt, now)
                            .SetOnInsert(item => item.UserKey, userKey)
                            .SetOnInsert(item => item.Type, CashbackEntryTypes.Spend)
                            .SetOnInsert(item => item.Reference, reference)
                            .SetOnInsert(item => item.CreatedAt, now),
                        new UpdateOptions { IsUpsert = true });
                }

                // Очередь трат: версия не сдвинулась — наша запись учла всё, что было до неё.
                var won = await _accounts.UpdateOneAsync(
                    item => item.UserKey == userKey && item.Version == account.Version,
                    Builders<CashbackAccountDb>.Update.Inc(item => item.Version, 1));
                if (won.ModifiedCount == 1)
                {
                    await RefreshAccountAsync(userKey);
                    return amount;
                }

                // Кто-то тратил одновременно: откатываем свою запись и считаем заново.
                if (previous == null)
                {
                    await _entries.DeleteOneAsync(item => item.IdempotencyKey == key && item.Status == CashbackSpendStatuses.Reserved);
                }
                else
                {
                    await _entries.ReplaceOneAsync(item => item.IdempotencyKey == key, previous);
                }
            }

            _logger.LogWarning("Cashback reserve for {UserKey} ({Reference}) gave up after {Attempts} concurrent attempts.", userKey, reference, MaxReserveAttempts);
            return 0m;
        }

        public Task<bool> CommitAsync(string reference, string orderId, string? orderNumber) =>
            CloseReservationAsync(reference, CashbackSpendStatuses.Committed, orderId, orderNumber);

        public Task<bool> ReleaseAsync(string reference) =>
            CloseReservationAsync(reference, CashbackSpendStatuses.Released, null, null);

        public async Task<bool> RebindReservationAsync(string fromReference, string toReference)
        {
            if (string.IsNullOrWhiteSpace(fromReference) || string.IsNullOrWhiteSpace(toReference) || fromReference == toReference)
            {
                return false;
            }

            try
            {
                var moved = await _entries.UpdateOneAsync(
                    item => item.IdempotencyKey == $"spend:{fromReference}" && item.Status == CashbackSpendStatuses.Reserved,
                    Builders<CashbackEntryDb>.Update
                        .Set(item => item.IdempotencyKey, $"spend:{toReference}")
                        .Set(item => item.Reference, toReference)
                        .Set(item => item.UpdatedAt, DateTime.UtcNow));
                return moved.ModifiedCount == 1;
            }
            catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
            {
                // Под этим платежом резерв уже есть (повтор запроса) — лишний временный снимаем.
                await ReleaseAsync(fromReference);
                return false;
            }
        }

        public async Task<IReadOnlyList<CashbackEntry>> GetStaleReservationsAsync(DateTime updatedBefore) =>
            (await _entries
                .Find(item => item.Type == CashbackEntryTypes.Spend
                              && item.Status == CashbackSpendStatuses.Reserved
                              && item.UpdatedAt < updatedBefore)
                .Limit(500)
                .ToListAsync())
            .Select(ToEntry)
            .ToList();

        public async Task<CashbackReversalResult> ReverseOrderAsync(string userKey, string orderId, decimal refundedFraction, bool returnSpent = true)
        {
            var result = new CashbackReversalResult();
            if (string.IsNullOrWhiteSpace(userKey) || string.IsNullOrWhiteSpace(orderId))
            {
                return result;
            }

            var fraction = Math.Clamp(refundedFraction, 0m, 1m);
            var entries = await LoadAsync(userKey);
            var now = DateTime.UtcNow;
            var options = _options.CurrentValue;
            var changed = false;

            var earn = entries.FirstOrDefault(entry => entry.Type == CashbackEntryTypes.Earn && entry.OrderId == orderId);
            if (earn != null)
            {
                var reversals = entries.Where(entry => entry.Type == CashbackEntryTypes.Reversal && entry.OrderId == orderId).ToList();
                var target = CashbackProjection.Round(earn.AmountUsd * fraction);
                var delta = target - reversals.Sum(entry => entry.AmountUsd);
                if (delta > 0)
                {
                    var spendTarget = CashbackProjection.Round((earn.OrderTotalUsd ?? 0m) * fraction);
                    var inserted = await TryInsertAsync(new CashbackEntryDb
                    {
                        UserKey = userKey,
                        Type = CashbackEntryTypes.Reversal,
                        AmountUsd = delta,
                        OrderId = orderId,
                        OrderNumber = earn.OrderNumber,
                        GameTitle = earn.GameTitle,
                        OrderTotalUsd = spendTarget - reversals.Sum(entry => entry.OrderTotalUsd ?? 0m),
                        CreatedAt = now,
                        // В ключе — и цель, и номер записи. Только цели не хватало: после отмены сторно (спор выиграли)
                        // и нового возврата на ту же сумму ключ совпадал со старой записью, вставка молча отбрасывалась
                        // как дубликат, и кэшбэк оставался на балансе навсегда. Повтор того же запроса при том же
                        // состоянии журнала даёт тот же ключ — идемпотентность сохраняется.
                        IdempotencyKey = $"reversal:{orderId}:{target:0.00}:{reversals.Count}"
                    });
                    if (inserted)
                    {
                        result.ReversedUsd = delta;
                        changed = true;
                    }
                }
            }

            var spend = !returnSpent ? null : entries.FirstOrDefault(entry => entry.Type == CashbackEntryTypes.Spend
                                                        && entry.OrderId == orderId
                                                        && entry.Status == CashbackSpendStatuses.Committed);
            if (spend != null)
            {
                var returns = entries.Where(entry => entry.Type == CashbackEntryTypes.Return && entry.OrderId == orderId).ToList();
                var target = CashbackProjection.Round(spend.AmountUsd * fraction);
                var delta = target - returns.Sum(entry => entry.AmountUsd);
                if (delta > 0)
                {
                    var inserted = await TryInsertAsync(new CashbackEntryDb
                    {
                        UserKey = userKey,
                        Type = CashbackEntryTypes.Return,
                        AmountUsd = delta,
                        OrderId = orderId,
                        OrderNumber = spend.OrderNumber,
                        CreatedAt = now,
                        ExpiresAt = ExpiryFrom(now, options),
                        IdempotencyKey = $"return:{orderId}:{target:0.00}"
                    });
                    if (inserted)
                    {
                        result.ReturnedUsd = delta;
                        changed = true;
                    }
                }
            }

            if (changed)
            {
                await RefreshAccountAsync(userKey);
            }
            return result;
        }

        public async Task<decimal> RestoreOrderAsync(string userKey, string orderId, string note)
        {
            if (string.IsNullOrWhiteSpace(userKey) || string.IsNullOrWhiteSpace(orderId))
            {
                return 0m;
            }

            var entries = await LoadAsync(userKey);
            var reversals = entries.Where(entry => entry.Type == CashbackEntryTypes.Reversal && entry.OrderId == orderId).ToList();
            // Отмена — та же запись «reversal», но с минусом: сумма всех записей по заказу и есть «сколько сейчас забрано».
            var net = CashbackProjection.Round(reversals.Sum(entry => entry.AmountUsd));
            if (net <= 0)
            {
                return 0m;
            }

            var earn = entries.FirstOrDefault(entry => entry.Type == CashbackEntryTypes.Earn && entry.OrderId == orderId);
            var inserted = await TryInsertAsync(new CashbackEntryDb
            {
                UserKey = userKey,
                Type = CashbackEntryTypes.Reversal,
                AmountUsd = -net,
                OrderId = orderId,
                OrderNumber = earn?.OrderNumber ?? reversals[0].OrderNumber,
                GameTitle = earn?.GameTitle ?? reversals[0].GameTitle,
                OrderTotalUsd = -reversals.Sum(entry => entry.OrderTotalUsd ?? 0m),
                CreatedAt = DateTime.UtcNow,
                Note = note,
                // Номер по числу записей: после отмены и нового спора по тому же заказу ключ будет другим.
                IdempotencyKey = $"restore:{orderId}:{reversals.Count}"
            });
            if (!inserted)
            {
                return 0m;
            }

            await RefreshAccountAsync(userKey);
            return net;
        }

        public async Task<CashbackEntry> AdjustAsync(string userKey, decimal amountUsd, string note, string actor)
        {
            if (string.IsNullOrWhiteSpace(userKey))
            {
                throw new ArgumentException("User is required.", nameof(userKey));
            }
            if (string.IsNullOrWhiteSpace(note))
            {
                throw new ArgumentException("A reason is required for a manual adjustment.", nameof(note));
            }

            var amount = CashbackProjection.Round(amountUsd);
            if (amount == 0)
            {
                throw new ArgumentException("Adjustment amount must not be zero.", nameof(amountUsd));
            }

            var now = DateTime.UtcNow;
            var entry = new CashbackEntryDb
            {
                UserKey = userKey,
                Type = CashbackEntryTypes.Adjust,
                AmountUsd = amount,
                CreatedAt = now,
                ExpiresAt = amount > 0 ? ExpiryFrom(now, _options.CurrentValue) : null,
                IdempotencyKey = $"adjust:{Guid.NewGuid():N}",
                Note = note.Trim(),
                Actor = actor
            };
            await _entries.InsertOneAsync(entry);
            await RefreshAccountAsync(userKey);
            return ToEntry(entry);
        }

        // ---------- внутреннее ----------

        private async Task<bool> CloseReservationAsync(string reference, string status, string? orderId, string? orderNumber)
        {
            if (string.IsNullOrWhiteSpace(reference))
            {
                return false;
            }

            var update = Builders<CashbackEntryDb>.Update
                .Set(item => item.Status, status)
                .Set(item => item.UpdatedAt, DateTime.UtcNow);
            if (orderId != null)
            {
                update = update.Set(item => item.OrderId, orderId).Set(item => item.OrderNumber, orderNumber);
            }

            var closed = await _entries.FindOneAndUpdateAsync(
                item => item.IdempotencyKey == $"spend:{reference}" && item.Status == CashbackSpendStatuses.Reserved,
                update);
            if (closed == null)
            {
                return false;
            }

            await RefreshAccountAsync(closed.UserKey);
            return true;
        }

        private async Task<List<CashbackEntry>> LoadAsync(string userKey) =>
            (await _entries.Find(item => item.UserKey == userKey).ToListAsync()).Select(ToEntry).ToList();

        private Task<CashbackEntryDb?> FindByKeyAsync(string key) =>
            _entries.Find(item => item.IdempotencyKey == key).FirstOrDefaultAsync()!;

        private async Task<bool> TryInsertAsync(CashbackEntryDb entry)
        {
            try
            {
                await _entries.InsertOneAsync(entry);
                return true;
            }
            catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
            {
                return false; // то же событие уже записано
            }
        }

        private async Task<CashbackAccountDb> EnsureAccountAsync(string userKey) =>
            await _accounts.FindOneAndUpdateAsync(
                item => item.UserKey == userKey,
                Builders<CashbackAccountDb>.Update
                    .SetOnInsert(item => item.Version, 0L)
                    .SetOnInsert(item => item.UpdatedAt, DateTime.UtcNow),
                new FindOneAndUpdateOptions<CashbackAccountDb> { IsUpsert = true, ReturnDocument = ReturnDocument.After });

        /// <summary>Снимок баланса для отчётов админки. Не источник правды — только кэш журнала.</summary>
        private async Task RefreshAccountAsync(string userKey)
        {
            try
            {
                var summary = CashbackProjection.Project(await LoadAsync(userKey), DateTime.UtcNow);
                await _accounts.UpdateOneAsync(
                    item => item.UserKey == userKey,
                    Builders<CashbackAccountDb>.Update
                        .Set(item => item.AvailableUsd, summary.AvailableUsd)
                        .Set(item => item.PendingUsd, summary.PendingUsd)
                        .Set(item => item.ReservedUsd, summary.ReservedUsd)
                        .Set(item => item.EarnedAllTimeUsd, summary.EarnedAllTimeUsd)
                        .Set(item => item.UsedAllTimeUsd, summary.UsedAllTimeUsd)
                        .Set(item => item.QualifyingSpendUsd, summary.QualifyingSpendUsd)
                        .Set(item => item.UpdatedAt, DateTime.UtcNow)
                        .SetOnInsert(item => item.Version, 0L),
                    new UpdateOptions { IsUpsert = true });
            }
            catch (Exception ex)
            {
                // Снимок — кэш для отчётов; его сбой не должен отменять уже записанную операцию.
                _logger.LogWarning(ex, "Could not refresh cashback account snapshot for {UserKey}", userKey);
            }
        }

        private static DateTime? ExpiryFrom(DateTime from, CashbackOptions options) =>
            options.ExpiryMonths > 0 ? from.AddMonths(options.ExpiryMonths) : null;

        private static CashbackEntry ToEntry(CashbackEntryDb db) => new()
        {
            Id = db.Id,
            UserKey = db.UserKey,
            Type = db.Type,
            AmountUsd = db.AmountUsd,
            Status = db.Status,
            OrderId = db.OrderId,
            OrderNumber = db.OrderNumber,
            GameTitle = db.GameTitle,
            GameCoverUrl = db.GameCoverUrl,
            OrderTotalUsd = db.OrderTotalUsd,
            OrderTotal = db.OrderTotal,
            OrderCurrency = db.OrderCurrency,
            Percent = db.Percent,
            CreatedAt = db.CreatedAt,
            UnlocksAt = db.UnlocksAt,
            ExpiresAt = db.ExpiresAt,
            IdempotencyKey = db.IdempotencyKey,
            Reference = db.Reference,
            Note = db.Note,
            Actor = db.Actor,
            UpdatedAt = db.UpdatedAt
        };
    }
}
