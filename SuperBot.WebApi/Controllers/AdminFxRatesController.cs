using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Курсы валют для админки: посмотреть текущие, посмотреть историю, прислать новые, запустить импорт.
///
/// Приём курсов — та же точка входа, что и у автоматического импорта
/// (<see cref="IFxRateService.OfferAsync"/>), поэтому гард на скачок работает одинаково
/// для человека и для робота. Ответ честно говорит, какие курсы применены, а какие
/// отклонены и почему: молча проглотить отклонение значит оставить магазин на старом
/// курсе без объяснений. Человек может гард снять (force) — он видит процент и подтверждает
/// сознательно; робот — никогда.
/// </summary>
[ApiController]
[Route("api/admin/fx-rates")]
[Authorize(Roles = "admin")]
public class AdminFxRatesController : ControllerBase
{
    private readonly IFxRateService _fxRates;
    private readonly IFxRateRepository _repository;
    private readonly IFxRateImportService _import;
    private readonly StorefrontCurrencyOptions _currencies;
    private readonly FxOptions _fx;

    public AdminFxRatesController(
        IFxRateService fxRates,
        IFxRateRepository repository,
        IFxRateImportService import,
        IOptions<StorefrontCurrencyOptions> currencies,
        IOptionsSnapshot<FxOptions> fx)
    {
        _fxRates = fxRates;
        _repository = repository;
        _import = import;
        _currencies = currencies.Value;
        _fx = fx.Value;
    }

    [HttpGet]
    public ActionResult<object> GetCurrent()
    {
        var book = _fxRates.Current();
        var known = book.All().ToDictionary(r => r.To, StringComparer.OrdinalIgnoreCase);

        // Список — по поддерживаемым валютам витрины, а не по тому, что есть в книге: валюта без
        // курса должна быть видна как «курса нет», а не отсутствовать в таблице.
        var rows = _currencies.Supported()
            .Where(c => !string.Equals(c, _currencies.Base, StringComparison.OrdinalIgnoreCase))
            .Select(currency =>
            {
                known.TryGetValue(currency, out var rate);
                var manual = _fx.ManualRates.TryGetValue(currency, out var m) ? m : (decimal?)null;
                return new
                {
                    currency,
                    rate = rate?.Rate,
                    capturedAt = rate?.CapturedAtUtc,
                    rounding = _fx.RuleFor(currency).ToString(),
                    manualOverride = manual,
                    // Как из курса получается цена: курс → наценка → округление. Показываем на 10 единицах
                    // базовой валюты, чтобы было видно, что даёт наценка и округление вместе.
                    samplePriceFor10 = rate is null
                        ? (decimal?)null
                        : FxConversion.Convert(10m, rate, _fx.MarkupPercent, _fx.RuleFor(currency), currency)
                };
            })
            .OrderBy(r => r.currency)
            .ToList();

        return Ok(new
        {
            baseCurrency = _currencies.Base,
            supportedCurrencies = _currencies.Supported(),
            markupPercent = _fx.MarkupPercent,
            maxChangePercent = _fx.MaxChangePercent,
            roundingByCurrency = _fx.Rounding,
            source = new
            {
                configured = !string.IsNullOrWhiteSpace(_fx.Source?.Url),
                url = _fx.Source?.Url,
            },
            rates = rows
        });
    }

    /// <summary>История курса валюты — чем закрывают спор «по какому курсу посчитали заказ».</summary>
    [HttpGet("{currency}/history")]
    public async Task<ActionResult<object>> GetHistory(string currency, [FromQuery] int limit = 60)
    {
        var history = await _repository.GetHistoryAsync(_currencies.Base, currency, limit);
        return Ok(history.Select(rate => new
        {
            currency = rate.To,
            rate = rate.Rate,
            capturedAt = rate.CapturedAtUtc
        }));
    }

    [HttpPost]
    public async Task<ActionResult<object>> Offer([FromBody] OfferFxRatesRequest request)
    {
        if (request?.Rates is null || request.Rates.Count == 0)
        {
            return BadRequest(new { message = "No rates supplied." });
        }

        var now = DateTime.UtcNow;
        var incoming = request.Rates
            .Where(pair => !string.IsNullOrWhiteSpace(pair.Key))
            .Select(pair => new FxRate(_currencies.Base, pair.Key.Trim().ToUpperInvariant(), pair.Value, now))
            .ToList();

        var results = await _fxRates.OfferAsync(incoming, bypassGuard: request.Force);
        return Ok(results.Select(result => new
        {
            currency = result.Rate.To,
            rate = result.Rate.Rate,
            accepted = result.Accepted,
            changePercent = Math.Round(result.ChangePercent, 2),
            reason = result.Reason
        }));
    }

    /// <summary>
    /// Запустить импорт из внешнего источника прямо сейчас, не дожидаясь расписания. Импорт
    /// сам ничего не ломает: отклонённые гардом курсы остаются прежними.
    /// </summary>
    [HttpPost("import")]
    public async Task<ActionResult<object>> ImportNow()
    {
        if (string.IsNullOrWhiteSpace(_fx.Source?.Url))
        {
            return Conflict(new { message = "No import source configured (Storefront:Fx:Source:Url)." });
        }

        var before = _fxRates.Current().All().ToDictionary(r => r.To, r => r, StringComparer.OrdinalIgnoreCase);
        await _import.RunAsync();
        var after = _fxRates.Current().All();

        // RunAsync ничего не возвращает — сравниваем книгу до/после, чтобы сказать, что изменилось.
        var changed = after
            .Where(r => !before.TryGetValue(r.To, out var prev) || prev.CapturedAtUtc != r.CapturedAtUtc)
            .Select(r => r.To)
            .OrderBy(c => c)
            .ToList();

        return Ok(new { updated = changed, message = changed.Count == 0 ? "Import ran; no rates changed (guard, same values, or source error — see logs)." : $"Updated: {string.Join(", ", changed)}." });
    }

    public class OfferFxRatesRequest
    {
        /// <summary>Код валюты → сколько её единиц даёт единица базовой.</summary>
        public Dictionary<string, decimal> Rates { get; set; } = new();
        /// <summary>Снять гард на скачок. Только для осознанного ручного ввода.</summary>
        public bool Force { get; set; }
    }
}
