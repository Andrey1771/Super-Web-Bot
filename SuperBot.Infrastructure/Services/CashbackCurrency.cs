using Microsoft.Extensions.Options;
using SuperBot.Core.Payments;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>
    /// Пересчёт кэшбэка между долларами (в них хранится баланс) и валютой витрины.
    ///
    /// Курс берётся с той же наценкой, что и у цен: цена в евро — это долларовая цена, пересчитанная
    /// с наценкой, поэтому и доллар кэшбэка в евро стоит столько же, сколько доллар цены. Иначе
    /// кэшбэк в евро тратился бы «дешевле», чем начислялся.
    /// </summary>
    public interface ICashbackCurrency
    {
        /// <summary>Сумма в валюте → доллары. null — курса для валюты нет.</summary>
        decimal? ToUsd(decimal amount, string? currency);

        /// <summary>Доллары → валюта, до её точности. null — курса нет.</summary>
        decimal? FromUsd(decimal usd, string? currency);
    }

    public class CashbackCurrency : ICashbackCurrency
    {
        private readonly IFxRateService _fxRates;
        private readonly IOptionsMonitor<FxOptions> _fxOptions;

        public CashbackCurrency(IFxRateService fxRates, IOptionsMonitor<FxOptions> fxOptions)
        {
            _fxRates = fxRates;
            _fxOptions = fxOptions;
        }

        public decimal? ToUsd(decimal amount, string? currency)
        {
            var rate = EffectiveRate(currency);
            return rate == null ? null : amount / rate.Value;
        }

        public decimal? FromUsd(decimal usd, string? currency)
        {
            var rate = EffectiveRate(currency);
            return rate == null ? null : CurrencyMinorUnits.Round(usd * rate.Value, currency);
        }

        /// <summary>Сколько единиц валюты за доллар, с наценкой. У базовой валюты — 1.</summary>
        private decimal? EffectiveRate(string? currency)
        {
            var book = _fxRates.Current();
            if (string.IsNullOrWhiteSpace(currency)
                || string.Equals(currency.Trim(), book.BaseCurrency, StringComparison.OrdinalIgnoreCase))
            {
                return 1m;
            }

            var rate = book.For(currency.Trim().ToUpperInvariant());
            if (rate is null || rate.Rate <= 0)
            {
                return null;
            }
            return rate.Rate * (1m + _fxOptions.CurrentValue.MarkupPercent / 100m);
        }
    }
}
