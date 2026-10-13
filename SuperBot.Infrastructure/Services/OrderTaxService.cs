using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Payments;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>Stripe Tax. Секция конфигурации «Tax».</summary>
    public class TaxOptions
    {
        public bool Enabled { get; set; } = true;

        /// <summary>Код товара Stripe Tax для игр: «Video Games - downloaded - non subscription - with permanent rights».</summary>
        public string ProductTaxCode { get; set; } = "txcd_10201000";

        /// <summary>Код для ключей ПО: «Downloadable Software - personal use».</summary>
        public string SoftwareTaxCode { get; set; } = "txcd_10202000";

        /// <summary>
        /// Код для подписок на ПО. По умолчанию тот же, что у ПО: в списке Stripe у скачиваемого ПО есть отдельные коды для
        /// подписок — выберите подходящий в Dashboard → Tax codes и задайте здесь (Tax__SoftwareSubscriptionTaxCode).
        /// </summary>
        public string SoftwareSubscriptionTaxCode { get; set; } = "txcd_10202000";

        /// <summary>Налоговый код строки заказа по её типу (<see cref="ProductTypes"/>). Неизвестный или пустой тип — игра.</summary>
        public string TaxCodeFor(string? productType) => productType switch
        {
            ProductTypes.Software => SoftwareTaxCode,
            ProductTypes.SoftwareSubscription => SoftwareSubscriptionTaxCode,
            _ => ProductTaxCode
        };

        /// <summary>
        /// Сколько минут переиспользовать предварительный расчёт для той же корзины и того же места. Stripe берёт плату
        /// за каждый расчёт, а касса пересоздаёт платёж на каждое изменение корзины и промокода.
        /// </summary>
        public int EstimateCacheMinutes { get; set; } = 30;
    }

    /// <summary>Налог на кассе: сколько налога внутри итога. Amount — в валюте заказа.</summary>
    public sealed record CheckoutTaxQuote(OrderTax Tax, decimal Amount);

    public class CheckoutTaxRequest
    {
        public string Currency { get; set; } = "USD";
        public IReadOnlyList<CheckoutLineItem> Items { get; set; } = Array.Empty<CheckoutLineItem>();
        /// <summary>Итог заказа до оплаты кэшбэком — налог считается с него.</summary>
        public decimal Total { get; set; }
        public string? IpAddress { get; set; }
        /// <summary>Страна, выбранная на сайте, — если по IP место не определить (локальная сеть, прокси).</summary>
        public string? SelectedCountry { get; set; }
    }

    public interface IOrderTaxService
    {
        /// <summary>Предварительный расчёт для кассы. null — налог выключен. Сбой Stripe оплате не мешает: налог 0, статус pending.</summary>
        Task<CheckoutTaxQuote?> EstimateAsync(CheckoutTaxRequest request);

        /// <summary>
        /// Оплаченный заказ: окончательный расчёт по стране из платёжных данных и запись транзакции в Stripe Tax.
        /// Никогда не бросает — не записанное повторит сверка.
        /// </summary>
        Task RecordOrderAsync(Order order, PaymentIntentSnapshot? intent, OrderTax? estimate);

        /// <summary>Возврат: сторно транзакции в той же доле. Никогда не бросает.</summary>
        Task OnOrderRefundedAsync(Order order);

        /// <summary>Приводит налог заказа в соответствие с заказом: дописывает транзакцию и недостающие сторно.</summary>
        Task SyncOrderAsync(Order order);
    }

    public class OrderTaxService : IOrderTaxService
    {
        private readonly IStripeTaxGateway _gateway;
        private readonly IStripePaymentIntentGateway _paymentIntents;
        private readonly IOrderRepository _orders;
        private readonly IMemoryCache _cache;
        private readonly IOptionsMonitor<TaxOptions> _options;
        private readonly ILogger<OrderTaxService> _logger;

        public OrderTaxService(
            IStripeTaxGateway gateway,
            IStripePaymentIntentGateway paymentIntents,
            IOrderRepository orders,
            IMemoryCache cache,
            IOptionsMonitor<TaxOptions> options,
            ILogger<OrderTaxService> logger)
        {
            _gateway = gateway;
            _paymentIntents = paymentIntents;
            _orders = orders;
            _cache = cache;
            _options = options;
            _logger = logger;
        }

        public async Task<CheckoutTaxQuote?> EstimateAsync(CheckoutTaxRequest request)
        {
            var options = _options.CurrentValue;
            if (!options.Enabled)
            {
                return null;
            }

            // По IP — если он настоящий: из локальной сети или docker Stripe место не определит. Иначе — выбранная страна.
            var ip = IsPublicIp(request.IpAddress) ? request.IpAddress : null;
            var country = ip == null ? NormalizeCountry(request.SelectedCountry) : null;
            var source = ip != null ? "ip" : "selected_country";
            if (ip == null && country == null)
            {
                return new CheckoutTaxQuote(new OrderTax { LastError = "Customer location is unknown." }, 0m);
            }

            var draft = BuildDraft(request.Items, request.Total, request.Currency, options);
            if (draft.Lines.Count == 0)
            {
                return new CheckoutTaxQuote(new OrderTax(), 0m);
            }
            draft.IpAddress = ip;
            draft.Country = country;

            try
            {
                var cacheKey = CacheKey(draft);
                if (!_cache.TryGetValue(cacheKey, out TaxCalculationSnapshot? calculation) || calculation == null)
                {
                    calculation = await _gateway.CalculateAsync(draft);
                    _cache.Set(cacheKey, calculation, TimeSpan.FromMinutes(Math.Max(1, options.EstimateCacheMinutes)));
                }

                var tax = FromCalculation(calculation, source);
                return new CheckoutTaxQuote(tax, CurrencyMinorUnits.FromMinor(calculation.TaxInclusiveMinor, request.Currency));
            }
            catch (Exception ex)
            {
                // Цены с налогом внутри: сумма к оплате от расчёта не зависит, поэтому касса работает дальше.
                _logger.LogWarning(ex, "Stripe Tax estimate failed; checkout continues without a tax breakdown.");
                return new CheckoutTaxQuote(new OrderTax { LastError = Short(ex) }, 0m);
            }
        }

        public async Task RecordOrderAsync(Order order, PaymentIntentSnapshot? intent, OrderTax? estimate)
        {
            if (!_options.CurrentValue.Enabled || !IsStripe(order) || order.Tax?.Status == OrderTaxStatuses.Recorded)
            {
                return;
            }

            var tax = order.Tax ?? Copy(estimate) ?? new OrderTax();
            try
            {
                await RecordCoreAsync(order, intent, tax);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Tax transaction for order {OrderId} was not recorded; the sync will retry.", order.Id);
                tax.Status = OrderTaxStatuses.Pending;
                tax.LastError = Short(ex);
                await SaveBestEffortAsync(order, tax);
            }
        }

        public async Task OnOrderRefundedAsync(Order order)
        {
            try
            {
                await ReverseCoreAsync(order);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Tax reversal for order {OrderId} failed; the sync will retry.", order.Id);
            }
        }

        public async Task SyncOrderAsync(Order order)
        {
            if (!_options.CurrentValue.Enabled || !IsStripe(order) || !order.IsPaid)
            {
                return;
            }

            if (order.Tax?.Status != OrderTaxStatuses.Recorded)
            {
                var intent = await _paymentIntents.GetAsync(order.PaymentIntentId!);
                await RecordCoreAsync(order, intent, order.Tax ?? new OrderTax());
            }
            await ReverseCoreAsync(order);
        }

        private async Task RecordCoreAsync(Order order, PaymentIntentSnapshot? intent, OrderTax tax)
        {
            var options = _options.CurrentValue;
            var currency = string.IsNullOrWhiteSpace(order.Currency) ? "USD" : order.Currency;
            // Налог — со всего итога: кэшбэк здесь способ оплаты, а не скидка, цена товара от него не меняется.
            var total = (order.TotalAmount ?? order.Totals.Total) + order.CashbackApplied;
            var items = order.Items.Select(item => new CheckoutLineItem
            {
                GameId = item.GameId,
                EditionCode = item.EditionCode,
                OfferKey = item.OfferKey,
                // Тип строки — ради налогового кода: без него окончательный расчёт облагал бы ПО как игру.
                ProductType = string.IsNullOrWhiteSpace(item.ProductType) ? ProductTypes.Game : item.ProductType,
                Quantity = item.Quantity,
                LineTotal = item.LineTotal
            }).ToList();

            // Окончательное место — из платёжных данных: страна адреса карты, затем страна банка карты.
            // В США без индекса налог не посчитать — там остаёмся на предварительном расчёте.
            var (country, postal, source) = FinalLocation(intent);
            TaxCalculationSnapshot? calculation = null;

            async Task CalculateAsync(string calculationCountry, string? calculationPostal, string calculationSource)
            {
                var draft = BuildDraft(items, total, currency, options);
                draft.Country = calculationCountry;
                draft.PostalCode = calculationPostal;
                calculation = await _gateway.CalculateAsync(draft);
                Apply(tax, calculation, calculationSource);
            }

            if (country != null)
            {
                if (tax.CalculationId != null && string.Equals(tax.Country, country, StringComparison.OrdinalIgnoreCase))
                {
                    // Предварительный расчёт сделан для той же страны — он и так верный, второй платный не нужен.
                    tax.LocationSource = source;
                }
                else
                {
                    await CalculateAsync(country, postal, source!);
                }
            }

            // Ни платёжных данных, ни предварительного расчёта (Stripe не отвечал на кассе) — по выбранной на сайте стране.
            var fallbackCountry = NormalizeCountry(order.BuyerCountry);
            if (tax.CalculationId == null)
            {
                if (fallbackCountry == null)
                {
                    throw new InvalidOperationException("Customer location is unknown: no billing country, card country or selected country.");
                }
                await CalculateAsync(fallbackCountry, null, "selected_country");
            }

            // Референс — платёж: одна транзакция на платёж, повтор с тем же ключом Stripe не задвоит.
            var reference = order.PaymentIntentId!;
            // Расчёт ложится в заказ ДО транзакции. Если ответ Stripe потеряется уже после того, как транзакция создана,
            // повтор пойдёт с тем же расчётом и тем же ключом идемпотентности и получит ту же транзакцию. Со свежим
            // расчётом он получал бы отказ навсегда: reference занят, а ключ использован с другими параметрами.
            await SavePendingAsync(order, tax, calculation, currency);
            try
            {
                tax.TransactionId = await _gateway.CreateTransactionAsync(tax.CalculationId!, reference, $"tax_tx_{reference}");
            }
            catch (Stripe.StripeException) when (calculation == null)
            {
                // Переиспользованный расчёт с кассы протух (живёт 90 дней) — считаем заново по той же стране.
                var retryCountry = country ?? NormalizeCountry(tax.Country) ?? fallbackCountry;
                if (retryCountry == null)
                {
                    throw;
                }
                await CalculateAsync(retryCountry, country != null ? postal : null, country != null ? source! : tax.LocationSource ?? "selected_country");
                await SavePendingAsync(order, tax, calculation, currency);
                tax.TransactionId = await _gateway.CreateTransactionAsync(tax.CalculationId!, reference, $"tax_tx_{reference}_{tax.CalculationId}");
            }
            tax.Status = OrderTaxStatuses.Recorded;
            tax.LastError = null;
            tax.RecordedAt = DateTime.UtcNow;
            if (tax.AmountTotalMinor <= 0)
            {
                tax.AmountTotalMinor = CurrencyMinorUnits.ToMinor(total, currency);
            }

            var taxTotal = calculation != null
                ? CurrencyMinorUnits.FromMinor(calculation.TaxInclusiveMinor, currency)
                : order.TaxTotal ?? order.Totals.TaxTotal;
            order.Tax = tax;
            order.TaxTotal = taxTotal;
            order.Totals.TaxTotal = taxTotal;
            await _orders.SetTaxAsync(order.Id.ToString(), tax, taxTotal);
        }

        private async Task ReverseCoreAsync(Order order)
        {
            var tax = order.Tax;
            if (!IsStripe(order) || tax?.Status != OrderTaxStatuses.Recorded || tax.TransactionId == null || tax.AmountTotalMinor <= 0)
            {
                return;
            }

            var fraction = RefundedFraction(order);
            var target = fraction >= 1m
                ? tax.AmountTotalMinor
                : (long)Math.Round(tax.AmountTotalMinor * fraction, MidpointRounding.AwayFromZero);
            if (target <= tax.ReversedMinor)
            {
                return;
            }

            // Референс сторно уникален и детерминирован: по накопленной сумме повтор того же возврата — тот же запрос.
            var reference = $"{order.PaymentIntentId}-refund-{target}";
            await _gateway.ReverseTransactionAsync(new TaxReversalDraft
            {
                OriginalTransactionId = tax.TransactionId,
                Reference = reference,
                Full = tax.ReversedMinor == 0 && target == tax.AmountTotalMinor,
                AmountMinor = target - tax.ReversedMinor
            }, $"tax_rev_{reference}");

            tax.ReversedMinor = target;
            await _orders.SetTaxAsync(order.Id.ToString(), tax, order.TaxTotal ?? order.Totals.TaxTotal);
        }

        /// <summary>
        /// Строки для Stripe Tax: суммы строк после скидок каталога, а промокод на заказ разложен по строкам
        /// пропорционально — так, чтобы сумма строк в минорных единицах совпала с итогом до копейки. Налоговый код — у каждой
        /// строки свой, по типу товара: игры и ПО облагаются по-разному, а в одном заказе бывают оба.
        /// </summary>
        public static TaxCalculationDraft BuildDraft(IReadOnlyList<CheckoutLineItem> items, decimal total, string currency, TaxOptions options)
        {
            var lines = items
                .Select((item, index) => (Item: item, Index: index, Minor: CurrencyMinorUnits.ToMinor(Math.Max(0m, item.LineTotal), currency)))
                .ToList();
            var totalMinor = CurrencyMinorUnits.ToMinor(Math.Max(0m, total), currency);
            var allocated = Allocate(lines.Select(line => line.Minor).ToList(), totalMinor);

            return new TaxCalculationDraft
            {
                Currency = currency,
                TaxCode = options.ProductTaxCode,
                Lines = lines
                    .Select((line, i) => new TaxLineDraft
                    {
                        Reference = Reference(line.Index, line.Item),
                        AmountMinor = allocated[i],
                        Quantity = Math.Max(1, line.Item.Quantity),
                        TaxCode = options.TaxCodeFor(line.Item.ProductType)
                    })
                    .Where(line => line.AmountMinor > 0)
                    .ToList()
            };
        }

        /// <summary>Делит total пропорционально весам методом наибольших остатков. Сумма результата — ровно min(total, Σвесов).</summary>
        public static IReadOnlyList<long> Allocate(IReadOnlyList<long> weights, long total)
        {
            var sum = weights.Sum();
            if (sum <= 0 || total <= 0)
            {
                return weights.Select(_ => 0L).ToList();
            }
            if (total >= sum)
            {
                return weights.ToList();
            }

            var shares = weights.Select(weight => (decimal)weight * total / sum).ToList();
            var result = shares.Select(share => (long)Math.Floor(share)).ToList();
            var remainder = total - result.Sum();
            foreach (var index in shares
                         .Select((share, i) => (Fraction: share - Math.Floor(share), Index: i))
                         .OrderByDescending(item => item.Fraction)
                         .ThenBy(item => item.Index)
                         .Take((int)remainder)
                         .Select(item => item.Index))
            {
                result[index]++;
            }
            return result;
        }

        private static string Reference(int index, CheckoutLineItem item)
        {
            var parts = new[] { item.GameId, item.EditionCode, item.OfferKey }.Where(part => !string.IsNullOrWhiteSpace(part));
            var value = $"{index + 1}:{string.Join("/", parts)}";
            return value.Length > 500 ? value[..500] : value;
        }

        private static (string? Country, string? PostalCode, string? Source) FinalLocation(PaymentIntentSnapshot? intent)
        {
            var billing = NormalizeCountry(intent?.BillingCountry);
            if (billing != null && (billing != "US" || !string.IsNullOrWhiteSpace(intent!.BillingPostalCode)))
            {
                return (billing, intent!.BillingPostalCode, "billing_address");
            }

            var card = NormalizeCountry(intent?.CardCountry);
            if (card != null && card != "US" && card != "CA")
            {
                return (card, null, "card");
            }
            return (null, null, null);
        }

        private static OrderTax FromCalculation(TaxCalculationSnapshot calculation, string source)
        {
            var tax = new OrderTax();
            Apply(tax, calculation, source);
            return tax;
        }

        private static void Apply(OrderTax tax, TaxCalculationSnapshot calculation, string source)
        {
            tax.CalculationId = calculation.Id;
            tax.LocationSource = source;
            tax.Country = calculation.Country;
            tax.State = calculation.State;
            tax.TaxType = calculation.TaxType;
            tax.RatePercent = calculation.RatePercent;
            tax.TaxabilityReason = calculation.TaxabilityReason;
            tax.AmountTotalMinor = calculation.AmountTotalMinor;
            tax.LastError = null;
        }

        /// <summary>Промежуточное состояние: расчёт есть, транзакции ещё нет. Повтор после сбоя продолжает с него.</summary>
        private async Task SavePendingAsync(Order order, OrderTax tax, TaxCalculationSnapshot? calculation, string currency)
        {
            tax.Status = OrderTaxStatuses.Pending;
            var taxTotal = calculation != null
                ? CurrencyMinorUnits.FromMinor(calculation.TaxInclusiveMinor, currency)
                : order.TaxTotal ?? order.Totals.TaxTotal;
            await _orders.SetTaxAsync(order.Id.ToString(), tax, taxTotal);
        }

        private async Task SaveBestEffortAsync(Order order, OrderTax tax)
        {
            try
            {
                order.Tax = tax;
                await _orders.SetTaxAsync(order.Id.ToString(), tax, order.TaxTotal ?? order.Totals.TaxTotal);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Could not save the tax state of order {OrderId}.", order.Id);
            }
        }

        private static OrderTax? Copy(OrderTax? source) => source == null
            ? null
            : new OrderTax
            {
                Status = OrderTaxStatuses.Pending,
                CalculationId = source.CalculationId,
                LocationSource = source.LocationSource,
                Country = source.Country,
                State = source.State,
                TaxType = source.TaxType,
                RatePercent = source.RatePercent,
                TaxabilityReason = source.TaxabilityReason,
                AmountTotalMinor = source.AmountTotalMinor,
                LastError = source.LastError
            };

        private static bool IsStripe(Order order) =>
            string.Equals(order.PaymentProvider, "stripe", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(order.PaymentIntentId);

        /// <summary>Та же доля, что у кэшбэка (<see cref="OrderRefunds.Fraction"/>): налог — со всей стоимости заказа.</summary>
        private static decimal RefundedFraction(Order order) => OrderRefunds.Fraction(order);

        private static string? NormalizeCountry(string? code) =>
            code is { Length: 2 } && code.All(char.IsLetter) ? code.ToUpperInvariant() : null;

        public static bool IsPublicIp(string? value)
        {
            if (!IPAddress.TryParse(value, out var ip))
            {
                return false;
            }
            if (ip.IsIPv4MappedToIPv6)
            {
                ip = ip.MapToIPv4();
            }
            if (IPAddress.IsLoopback(ip))
            {
                return false;
            }
            if (ip.AddressFamily == AddressFamily.InterNetworkV6)
            {
                return !(ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6UniqueLocal);
            }

            var b = ip.GetAddressBytes();
            return !(b[0] == 10
                     || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
                     || (b[0] == 192 && b[1] == 168)
                     || (b[0] == 169 && b[1] == 254)
                     || (b[0] == 100 && b[1] >= 64 && b[1] <= 127)
                     || b[0] == 0);
        }

        private static string CacheKey(TaxCalculationDraft draft)
        {
            var payload = $"{draft.Currency}|{draft.TaxCode}|{draft.Country}|{draft.IpAddress}|"
                          + string.Join(",", draft.Lines.Select(line => $"{line.Reference}={line.AmountMinor}x{line.Quantity}:{line.TaxCode}"));
            return "tax-estimate:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload)));
        }

        private static string Short(Exception ex)
        {
            var message = ex is Stripe.StripeException stripe && stripe.StripeError?.Code is { } code
                ? $"{code}: {ex.Message}"
                : ex.Message;
            return message.Length > 300 ? message[..300] : message;
        }
    }

    /// <summary>Ежечасная сверка налога: дописывает транзакции, которые не записались при оплате, и сторно возвратов.</summary>
    public interface ITaxSyncService
    {
        Task RunAsync();
    }

    public class TaxSyncService : ITaxSyncService
    {
        /// <summary>Расчёт Stripe живёт 90 дней; дальше смотреть незачем, а возвраты приходят раньше.</summary>
        private static readonly TimeSpan Lookback = TimeSpan.FromDays(120);

        private readonly IOrderRepository _orders;
        private readonly IOrderTaxService _tax;
        private readonly IOptionsMonitor<TaxOptions> _options;
        private readonly ILogger<TaxSyncService> _logger;

        public TaxSyncService(IOrderRepository orders, IOrderTaxService tax, IOptionsMonitor<TaxOptions> options, ILogger<TaxSyncService> logger)
        {
            _orders = orders;
            _tax = tax;
            _options = options;
            _logger = logger;
        }

        public async Task RunAsync()
        {
            if (!_options.CurrentValue.Enabled)
            {
                return;
            }

            var orders = await _orders.GetPaidOrdersSinceAsync(DateTime.UtcNow - Lookback);
            var failed = 0;
            foreach (var order in orders)
            {
                try
                {
                    await _tax.SyncOrderAsync(order);
                }
                catch (Exception ex)
                {
                    failed++;
                    _logger.LogWarning(ex, "Tax sync failed for order {OrderId}", order.Id);
                }
            }
            _logger.LogInformation("Tax sync checked {Count} orders, {Failed} failed.", orders.Count, failed);
        }
    }
}
