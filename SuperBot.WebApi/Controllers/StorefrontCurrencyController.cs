using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Services;

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
        [AllowAnonymous]
        [HttpGet]
        [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
        public ActionResult<StorefrontCurrencyResponse> Get()
        {
            var baseCurrency = CheckoutPricingService.SettlementCurrency;

            return Ok(new StorefrontCurrencyResponse
            {
                BaseCurrency = baseCurrency,
                FractionDigits = CurrencyMinorUnits.Exponent(baseCurrency),
                // Пока в каталоге одна цена без валюты, показывать можно только валюту расчёта.
                // Появятся прайс-листы и курсы — список расширится здесь, и переключатель
                // в шапке оживёт сам: он рендерит ровно то, что пришло с сервера.
                SupportedCurrencies = new[] { baseCurrency }
            });
        }
    }

    public class StorefrontCurrencyResponse
    {
        /// <summary>Валюта, в которой ведётся каталог и происходит списание.</summary>
        public string BaseCurrency { get; set; } = string.Empty;

        /// <summary>Знаков после запятой у базовой валюты.</summary>
        public int FractionDigits { get; set; }

        /// <summary>Валюты, которые витрина имеет право показывать.</summary>
        public IReadOnlyList<string> SupportedCurrencies { get; set; } = Array.Empty<string>();
    }
}
