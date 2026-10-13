namespace SuperBot.Core.Cashback
{
    /// <summary>Баланс покупателя на момент <see cref="Now"/>, посчитанный из журнала.</summary>
    public class CashbackSummary
    {
        public DateTime Now { get; set; }
        /// <summary>Можно тратить: разблокировано, не сгорело, не отложено под платёж.</summary>
        public decimal AvailableUsd { get; set; }
        /// <summary>Начислено, но ещё ждёт конца срока ожидания.</summary>
        public decimal PendingUsd { get; set; }
        /// <summary>Отложено под платежи, которые ещё не прошли.</summary>
        public decimal ReservedUsd { get; set; }
        /// <summary>Начислено за всё время за вычетом забранного при возвратах.</summary>
        public decimal EarnedAllTimeUsd { get; set; }
        /// <summary>Потрачено на заказы за вычетом вернувшегося при возвратах.</summary>
        public decimal UsedAllTimeUsd { get; set; }
        public decimal ExpiredAllTimeUsd { get; set; }
        /// <summary>Сколько при возвратах забрать не получилось, потому что баланс уже был потрачен.</summary>
        public decimal ForgivenAllTimeUsd { get; set; }
        /// <summary>Сумма оплаченных деньгами заказов без возвращённых — по ней считается уровень.</summary>
        public decimal QualifyingSpendUsd { get; set; }
        /// <summary>Ближайшая разблокировка.</summary>
        public DateTime? NextUnlockAt { get; set; }
        /// <summary>Состояние каждого начисления — для истории.</summary>
        public Dictionary<string, CashbackEarnState> Earns { get; set; } = new();
        /// <summary>Все пополнения баланса (начисления, вернувшийся кэшбэк, ручные прибавки) с остатком и сроком — для напоминаний о сгорании.</summary>
        public List<CashbackLotState> Lots { get; set; } = new();
    }

    public class CashbackLotState
    {
        /// <summary>Id записи журнала, из которой пополнение.</summary>
        public string Key { get; set; } = string.Empty;
        public bool IsEarn { get; set; }
        public bool Unlocked { get; set; }
        /// <summary>Не потрачено и не сгорело.</summary>
        public decimal RemainingUsd { get; set; }
        public DateTime? ExpiresAt { get; set; }
    }

    public class CashbackEarnState
    {
        public decimal AmountUsd { get; set; }
        public decimal ReversedUsd { get; set; }
        /// <summary>Сколько от начисления ещё не потрачено и не сгорело.</summary>
        public decimal RemainingUsd { get; set; }
        public decimal ExpiredUsd { get; set; }
        public bool Unlocked { get; set; }

        /// <summary>pending | available | spent | reverted | expired — то, что показывает кабинет.</summary>
        public string State =>
            ReversedUsd > 0 && ReversedUsd >= AmountUsd ? "reverted"
            : !Unlocked ? "pending"
            : RemainingUsd > 0 ? "available"
            : ExpiredUsd > 0 ? "expired"
            : "spent";
    }

    /// <summary>
    /// Пересчёт баланса из журнала. Чистая функция: одни записи и одно «сейчас» — один результат.
    ///
    /// Журнал проигрывается по времени. Каждое пополнение (начисление, возврат потраченного,
    /// ручная прибавка) — отдельная «партия» со своим сроком сгорания. Траты забирают из партий,
    /// которые сгорят раньше всех: так ничего не сгорает, пока человек пользуется балансом.
    /// Забрать при возврате заказа больше, чем есть, нельзя — баланс не уходит ниже нуля.
    /// </summary>
    public static class CashbackProjection
    {
        private const int OrderCreate = 0;
        private const int OrderUnlock = 1;
        private const int OrderReversal = 2;
        private const int OrderSpend = 3;
        private const int OrderExpire = 4;

        public static CashbackSummary Project(IEnumerable<CashbackEntry> entries, DateTime now)
        {
            var summary = new CashbackSummary { Now = now };
            var lots = new Dictionary<string, Lot>();
            var earnLotByOrder = new Dictionary<string, Lot>();
            var events = new List<(DateTime At, int Order, int Seq, Action Apply)>();
            var seq = 0;

            foreach (var entry in entries.OrderBy(item => item.CreatedAt))
            {
                if (entry.CreatedAt > now)
                {
                    continue;
                }

                var key = entry.Id ?? entry.IdempotencyKey;
                switch (entry.Type)
                {
                    case CashbackEntryTypes.Earn:
                    {
                        var lot = new Lot(key, entry.AmountUsd, entry.ExpiresAt) { IsEarn = true };
                        lots[key] = lot;
                        if (!string.IsNullOrEmpty(entry.OrderId))
                        {
                            earnLotByOrder[entry.OrderId] = lot;
                        }
                        summary.EarnedAllTimeUsd += entry.AmountUsd;
                        summary.QualifyingSpendUsd += entry.OrderTotalUsd ?? 0m;
                        var unlockAt = entry.UnlocksAt ?? entry.CreatedAt;
                        events.Add((unlockAt, OrderUnlock, seq++, () => lot.Unlocked = true));
                        AddExpiry(events, ref seq, lot, summary);
                        break;
                    }
                    case CashbackEntryTypes.Return:
                    case CashbackEntryTypes.Adjust when entry.AmountUsd > 0:
                    {
                        var lot = new Lot(key, entry.AmountUsd, entry.ExpiresAt);
                        lots[key] = lot;
                        if (entry.Type == CashbackEntryTypes.Return)
                        {
                            summary.UsedAllTimeUsd -= entry.AmountUsd;
                        }
                        events.Add((entry.CreatedAt, OrderCreate, seq++, () => lot.Unlocked = true));
                        AddExpiry(events, ref seq, lot, summary);
                        break;
                    }
                    case CashbackEntryTypes.Adjust:
                    {
                        var amount = -entry.AmountUsd;
                        events.Add((entry.CreatedAt, OrderSpend, seq++, () =>
                        {
                            var taken = Consume(lots.Values, amount);
                            summary.ForgivenAllTimeUsd += amount - taken;
                        }));
                        break;
                    }
                    case CashbackEntryTypes.Spend:
                    {
                        if (entry.Status == CashbackSpendStatuses.Released)
                        {
                            break;
                        }
                        if (entry.Status == CashbackSpendStatuses.Reserved)
                        {
                            summary.ReservedUsd += entry.AmountUsd;
                        }
                        else
                        {
                            summary.UsedAllTimeUsd += entry.AmountUsd;
                        }
                        var amount = entry.AmountUsd;
                        events.Add((entry.CreatedAt, OrderSpend, seq++, () => Consume(lots.Values, amount)));
                        break;
                    }
                    case CashbackEntryTypes.Reversal:
                    {
                        var orderId = entry.OrderId;
                        var amount = entry.AmountUsd;
                        summary.QualifyingSpendUsd -= entry.OrderTotalUsd ?? 0m;
                        events.Add((entry.CreatedAt, OrderReversal, seq++, () =>
                        {
                            if (orderId == null || !earnLotByOrder.TryGetValue(orderId, out var lot))
                            {
                                return;
                            }

                            if (amount < 0)
                            {
                                // Отмена забранного (спор выигран): возвращаем начисление в ту же партию. Часть, которую
                                // тогда забрать не удалось и простили, возвращать нечего — её просто перестаём считать прощённой,
                                // иначе покупатель получил бы деньги, которых у него не забирали.
                                var restore = Math.Min(-amount, lot.Reversed);
                                if (restore <= 0)
                                {
                                    return;
                                }
                                var unforgive = Math.Min(restore, lot.ReversalForgiven);
                                lot.ReversalForgiven -= unforgive;
                                summary.ForgivenAllTimeUsd -= unforgive;
                                lot.Reversed -= restore;
                                summary.EarnedAllTimeUsd += restore;
                                if (!lot.Expired)
                                {
                                    lot.Remaining += restore - unforgive;
                                }
                                return;
                            }

                            var take = Math.Min(amount, lot.Original - lot.Reversed);
                            if (take <= 0)
                            {
                                return;
                            }

                            lot.Reversed += take;
                            summary.EarnedAllTimeUsd -= take;

                            // Ещё не разблокировано — просто уменьшаем ожидающее начисление.
                            var fromLot = Math.Min(take, lot.Remaining);
                            lot.Remaining -= fromLot;
                            var rest = take - fromLot;
                            if (rest > 0 && lot.Unlocked)
                            {
                                // Начисление уже частично потрачено: добираем из остального баланса,
                                // но не ниже нуля — недостающее прощаем.
                                rest -= Consume(lots.Values, rest);
                            }
                            summary.ForgivenAllTimeUsd += rest;
                            lot.ReversalForgiven += rest;
                        }));
                        break;
                    }
                }
            }

            foreach (var (_, _, _, apply) in events
                         .Where(item => item.At <= now)
                         .OrderBy(item => item.At)
                         .ThenBy(item => item.Order)
                         .ThenBy(item => item.Seq))
            {
                apply();
            }

            foreach (var lot in lots.Values)
            {
                if (lot.Unlocked && !lot.Expired)
                {
                    summary.AvailableUsd += lot.Remaining;
                }
                else if (!lot.Unlocked)
                {
                    summary.PendingUsd += lot.Remaining;
                }
            }

            // Отложенное под платёж уже вычтено из партий при проигрывании; показываем его отдельно.
            summary.NextUnlockAt = events
                .Where(item => item.Order == OrderUnlock && item.At > now)
                .Select(item => (DateTime?)item.At)
                .OrderBy(item => item)
                .FirstOrDefault();

            foreach (var lot in lots.Values.Where(item => item.IsEarn))
            {
                summary.Earns[lot.Key] = new CashbackEarnState
                {
                    AmountUsd = lot.Original,
                    ReversedUsd = Round(lot.Reversed),
                    RemainingUsd = Round(lot.Expired ? 0 : lot.Remaining),
                    ExpiredUsd = Round(lot.ExpiredAmount),
                    Unlocked = lot.Unlocked
                };
            }

            summary.Lots = lots.Values
                .Select(lot => new CashbackLotState
                {
                    Key = lot.Key,
                    IsEarn = lot.IsEarn,
                    Unlocked = lot.Unlocked,
                    RemainingUsd = Round(lot.Expired ? 0 : lot.Remaining),
                    ExpiresAt = lot.ExpiresAt
                })
                .ToList();

            summary.AvailableUsd = Round(summary.AvailableUsd);
            summary.PendingUsd = Round(summary.PendingUsd);
            summary.ReservedUsd = Round(summary.ReservedUsd);
            summary.EarnedAllTimeUsd = Round(summary.EarnedAllTimeUsd);
            summary.UsedAllTimeUsd = Round(summary.UsedAllTimeUsd);
            summary.ExpiredAllTimeUsd = Round(summary.ExpiredAllTimeUsd);
            summary.ForgivenAllTimeUsd = Round(summary.ForgivenAllTimeUsd);
            summary.QualifyingSpendUsd = Round(Math.Max(0, summary.QualifyingSpendUsd));
            return summary;
        }

        /// <summary>Доллары до цента, половина — вверх по модулю, как везде в деньгах магазина.</summary>
        public static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

        private static void AddExpiry(List<(DateTime At, int Order, int Seq, Action Apply)> events, ref int seq, Lot lot, CashbackSummary summary)
        {
            if (lot.ExpiresAt is not { } expiresAt)
            {
                return;
            }

            events.Add((expiresAt, OrderExpire, seq++, () =>
            {
                if (lot.Expired)
                {
                    return;
                }
                lot.Expired = true;
                lot.ExpiredAmount = lot.Remaining;
                summary.ExpiredAllTimeUsd += lot.Remaining;
                lot.Remaining = 0;
            }));
        }

        /// <summary>Забирает сумму из разблокированных партий, раньше всех — те, что сгорят первыми. Возвращает, сколько удалось.</summary>
        private static decimal Consume(IEnumerable<Lot> lots, decimal amount)
        {
            var left = amount;
            foreach (var lot in lots
                         .Where(item => item.Unlocked && !item.Expired && item.Remaining > 0)
                         .OrderBy(item => item.ExpiresAt ?? DateTime.MaxValue))
            {
                if (left <= 0)
                {
                    break;
                }
                var take = Math.Min(left, lot.Remaining);
                lot.Remaining -= take;
                left -= take;
            }
            return amount - left;
        }

        private sealed class Lot
        {
            public Lot(string key, decimal amount, DateTime? expiresAt)
            {
                Key = key;
                Original = amount;
                Remaining = amount;
                ExpiresAt = expiresAt;
            }

            public string Key { get; }
            public decimal Original { get; }
            public decimal Remaining { get; set; }
            public decimal Reversed { get; set; }
            /// <summary>Сколько из забранного у этой партии не удалось взять с баланса и простили.</summary>
            public decimal ReversalForgiven { get; set; }
            public decimal ExpiredAmount { get; set; }
            public DateTime? ExpiresAt { get; }
            public bool Unlocked { get; set; }
            public bool Expired { get; set; }
            public bool IsEarn { get; init; }
        }
    }
}
