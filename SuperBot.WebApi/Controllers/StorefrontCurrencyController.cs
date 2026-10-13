using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Models;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers
{
    /// <summary>
    /// Валюта витрины. Единственный источник правды — сервер: витрина обязана показывать ту же
    /// валюту, в которой пройдёт списание, иначе покупатель видит одно, а платит другое.
    /// Раньше фронт знал валюту сам (хардкод "$" по компонентам плюс переключатель с выдуманными
    /// курсами) и расходился с расчётом — этот эндпоинт закрывает такую возможность.
    /// </summary>
    [ApiController]
    [Route("api/storefront/currency")]
    public class StorefrontCurrencyController : ControllerBase
    {
        private readonly StorefrontCurrencyOptions _currencies;

        public StorefrontCurrencyController(IOptions<StorefrontCurrencyOptions> currencies)
        {
            _currencies = currencies.Value;
        }

        [AllowAnonymous]
        [HttpGet]
        [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
        public ActionResult<StorefrontCurrencyResponse> Get()
        {
            var baseCurrency = _currencies.Base;

            return Ok(new StorefrontCurrencyResponse
            {
                BaseCurrency = baseCurrency,
                FractionDigits = CurrencyMinorUnits.Exponent(baseCurrency),
                // Реальный список из конфигурации: переключатель в шапке рендерит ровно то,
                // что пришло отсюда, и оживает сам, как только валют станет больше одной.
                SupportedCurrencies = _currencies.Supported(),
                // Знаки после запятой у каждой валюты — чтобы фронт форматировал JPY без копеек,
                // не заводя у себя второго списка zero-decimal валют.
                FractionDigitsByCurrency = _currencies.Supported()
                    .ToDictionary(code => code, CurrencyMinorUnits.Exponent, StringComparer.OrdinalIgnoreCase)
            });
        }
    }

    /// <summary>
    /// Чем можно заплатить в выбранной валюте. Отдельный эндпоинт, а не поле в ответе о валютах:
    /// набор рельсов зависит от валюты, а список валют кэшируется на пять минут.
    /// </summary>
    [ApiController]
    [Route("api/storefront/payment-methods")]
    public class StorefrontPaymentMethodsController : ControllerBase
    {
        private readonly StorefrontCurrencyOptions _currencies;
        private readonly StripeSettings _stripe;
        private readonly BtcPayOptions _btcPay;
        // Тумблеры рельсов из настроек сайта — снимок на запрос, чтобы выключенная в админке карта
        // пропала из чекаута сразу.
        private readonly SuperBot.WebApi.Services.SiteSettings.PaymentRailsOptions _rails;

        public StorefrontPaymentMethodsController(
            IOptions<StorefrontCurrencyOptions> currencies,
            IOptions<StripeSettings> stripe,
            IOptions<BtcPayOptions> btcPay,
            IOptionsSnapshot<SuperBot.WebApi.Services.SiteSettings.PaymentRailsOptions> rails)
        {
            _currencies = currencies.Value;
            _stripe = stripe.Value;
            _btcPay = btcPay.Value;
            _rails = rails.Value;
        }

        [AllowAnonymous]
        [HttpGet]
        public ActionResult<StorefrontPaymentMethodsResponse> Get([FromQuery] string? currency = null)
        {
            var resolved = _currencies.Resolve(currency);

            // Рельс без ключей не существует — предлагать его покупателю бессмысленно. Рельс с ключами,
            // но выключенный владельцем в настройках сайта, — тоже.
            var enabled = new List<PaymentMethod>();
            if (!string.IsNullOrWhiteSpace(_stripe.PublishableKey) && _rails.CardEnabled)
            {
                enabled.Add(PaymentMethod.Card);
            }
            if (_btcPay.IsAvailable && _rails.CryptoEnabled)
            {
                enabled.Add(PaymentMethod.Crypto);
            }

            var options = PaymentMethodAvailability.For(resolved, _currencies.Base, enabled);

            return Ok(new StorefrontPaymentMethodsResponse
            {
                Currency = resolved,
                Methods = options
                    .Select(option => new StorefrontPaymentMethod
                    {
                        Method = option.Method.ToString().ToLowerInvariant(),
                        Available = option.Available,
                        Reason = option.Reason
                    })
                    .ToList()
            });
        }
    }

    public class StorefrontPaymentMethodsResponse
    {
        /// <summary>Валюта, для которой посчитан список: та же, что вернёт чекаут.</summary>
        public string Currency { get; set; } = string.Empty;

        public IReadOnlyList<StorefrontPaymentMethod> Methods { get; set; } = Array.Empty<StorefrontPaymentMethod>();
    }

    public class StorefrontPaymentMethod
    {
        public string Method { get; set; } = string.Empty;

        public bool Available { get; set; }

        /// <summary>Почему недоступен — текст для покупателя. У доступного пусто.</summary>
        public string? Reason { get; set; }
    }

    public class StorefrontCurrencyResponse
    {
        /// <summary>Валюта, в которой ведётся каталог и происходит списание.</summary>
        public string BaseCurrency { get; set; } = string.Empty;

        /// <summary>Знаков после запятой у базовой валюты.</summary>
        public int FractionDigits { get; set; }

        /// <summary>Валюты, которые витрина имеет право показывать.</summary>
        public IReadOnlyList<string> SupportedCurrencies { get; set; } = Array.Empty<string>();

        /// <summary>Знаков после запятой по каждой поддерживаемой валюте.</summary>
        public IReadOnlyDictionary<string, int> FractionDigitsByCurrency { get; set; } =
            new Dictionary<string, int>();
    }
}
