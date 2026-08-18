using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Курсы валют для админки: посмотреть текущие, посмотреть историю, прислать новые.
///
/// Приём курсов — та же точка входа, что и у будущего автоматического импорта
/// (<see cref="IFxRateService.OfferAsync"/>), поэтому гард на скачок работает одинаково
/// для человека и для робота. Ответ честно говорит, какие курсы применены, а какие
/// отклонены и почему: молча проглотить отклонение значит оставить магазин на старом
/// курсе без объяснений.
/// </summary>
[ApiController]
[Route("api/admin/fx-rates")]
[Authorize(Roles = "admin")]
public class AdminFxRatesController : ControllerBase
{
    private readonly IFxRateService _fxRates;
    private readonly IFxRateRepository _repository;
    private readonly StorefrontCurrencyOptions _currencies;
    private readonly FxOptions _fx;

    public AdminFxRatesController(
        IFxRateService fxRates,
        IFxRateRepository repository,
        IOptions<StorefrontCurrencyOptions> currencies,
        IOptions<FxOptions> fx)
    {
        _fxRates = fxRates;
        _repository = repository;
        _currencies = currencies.Value;
        _fx = fx.Value;
    }

    [HttpGet]
    public ActionResult<object> GetCurrent()
    {
        var book = _fxRates.Current();

        return Ok(new
        {
            baseCurrency = book.BaseCurrency,
            markupPercent = _fx.MarkupPercent,
            maxChangePercent = _fx.MaxChangePercent,
            rates = book.All()
                .Select(rate => new
                {
                    currency = rate.To,
                    rate = rate.Rate,
                    capturedAt = rate.CapturedAtUtc,
                    rounding = _fx.RuleFor(rate.To).ToString()
                })
                .OrderBy(item => item.currency)
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
            return BadRequest("No rates supplied.");
        }

        var now = DateTime.UtcNow;
        var incoming = request.Rates
            .Where(pair => !string.IsNullOrWhiteSpace(pair.Key))
            .Select(pair => new FxRate(_currencies.Base, pair.Key.Trim().ToUpperInvariant(), pair.Value, now))
            .ToList();

        var results = await _fxRates.OfferAsync(incoming);

        return Ok(results.Select(result => new
        {
            currency = result.Rate.To,
            rate = result.Rate.Rate,
            accepted = result.Accepted,
            changePercent = Math.Round(result.ChangePercent, 2),
            reason = result.Reason
        }));
    }

    public class OfferFxRatesRequest
    {
        /// <summary>Код валюты → сколько её единиц даёт единица базовой.</summary>
        public Dictionary<string, decimal> Rates { get; set; } = new();
    }
}
