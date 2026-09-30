using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Services
{
    public interface ICheckoutPricingService
    {
        Task<CheckoutPricingResult> PriceAsync(CheckoutPricingRequest request);
    }

    public class CheckoutPricingRequest
    {
        public List<CheckoutPricingItem> Items { get; set; } = new();
        public string? PromoCode { get; set; }
        /// <summary>Для лимитов промокода «на пользователя».</summary>
        public string? UserName { get; set; }

        /// <summary>
        /// Валюта, в которой покупатель хочет платить. Выбирать её клиенту теперь можно,
        /// но только из списка витрины: неизвестная валюта молча становится базовой
        /// (см. <see cref="StorefrontCurrencyOptions.Resolve"/>), а сумма всё равно берётся
        /// из каталога — клиентским числам по-прежнему не верим.
        /// </summary>
        public string? Currency { get; set; }

        /// <summary>
        /// Страна покупателя (ISO alpha-2), если определена. Позиция, чьи ключи в этой стране не
        /// активируются, отклоняется — продать ключ, который не заработает, хуже, чем отказать.
        /// Неизвестная страна проверку пропускает.
        /// </summary>
        public string? BuyerCountry { get; set; }
    }

    public class CheckoutPricingItem
    {
        public string GameId { get; set; } = string.Empty;
        public int Quantity { get; set; }
        /// <summary>Код издания из карточки игры; пусто — базовое издание (цена игры).</summary>
        public string? EditionCode { get; set; }
        /// <summary>
        /// Выбранный региональный вариант ключа (<see cref="SuperBot.Core.Regions.RegionOffer.KeyOf"/>);
        /// пусто — вариант не выбирался, цена и выдача как раньше.
        /// </summary>
        public string? OfferKey { get; set; }
    }

    /// <summary>
    /// Посчитанная позиция заказа. Намеренно НЕ тип персистентности: раньше контракт сервиса
    /// возвращал CheckoutLineItemStateDb, из-за чего деталь хранения протекала во все вызывающие.
    /// </summary>
    public class CheckoutLineItem
    {
        public string ProductType { get; set; } = "Game";
        public string? GameId { get; set; }
        public string? EditionCode { get; set; }
        public string? EditionTitle { get; set; }
        /// <summary>Вариант ключа: по нему выдача возьмёт ключ из нужной группы склада.</summary>
        public string? OfferKey { get; set; }
        public string? OfferTitle { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? CoverUrl { get; set; }
        public string? Platform { get; set; }
        public string? Region { get; set; }
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal DiscountPerUnit { get; set; }
        public decimal FinalUnitPrice { get; set; }
        public decimal LineTotal { get; set; }
        public string Currency { get; set; } = "USD";
    }

    public class CheckoutPricingResult
    {
        public bool Success { get; set; }
        public string? Error { get; set; }
        /// <summary>Код причины для словаря витрины («checkout.cartEmpty»); подстановки — в ErrorArgs.</summary>
        public string? ErrorCode { get; set; }
        public object? ErrorArgs { get; set; }

        public List<CheckoutLineItem> Items { get; set; } = new();
        public decimal Subtotal { get; set; }
        public decimal DiscountTotal { get; set; }
        public decimal TaxTotal { get; set; }
        public decimal Total { get; set; }

        /// <summary>Сумма для Stripe в минорных единицах (центах) — без потери копеек.</summary>
        public long AmountMinorUnits { get; set; }

        /// <summary>Валюта расчёта — её определяет сервер, а не запрос.</summary>
        public string Currency { get; set; } = CheckoutPricingService.SettlementCurrency;

        public bool PromoApplied { get; set; }
        public string? NormalizedPromoCode { get; set; }

        /// <summary>Страна покупателя, с которой считался чекаут — кладётся в заказ для выдачи ключей.</summary>
        public string? BuyerCountry { get; set; }
        public string? PromoMessage { get; set; }
        /// <summary>Код сообщения промокода («promo.applied», «promo.notFound») для перевода на витрине.</summary>
        public string? PromoMessageCode { get; set; }

        public static CheckoutPricingResult Fail(string error, string? code = null, object? args = null) =>
            new() { Success = false, Error = error, ErrorCode = code, ErrorArgs = args };
    }

    public class CheckoutPricingService : ICheckoutPricingService
    {
        /// <summary>
        /// Валюта каталога по умолчанию, когда конфигурация ничего не задала. Раньше это была
        /// единственная валюта расчёта и константа; теперь валюту выбирает покупатель из списка
        /// <see cref="StorefrontCurrencyOptions"/>, а цена берётся из прайс-листа игры.
        /// Осталась только как значение по умолчанию — того же смысла, что и до мультивалютности.
        /// </summary>
        public const string SettlementCurrency = GamePricing.LegacyCurrency;

        /// <summary>Максимум позиций в одном заказе — защита от раздувания запроса.</summary>
        private const int MaxLineItems = 50;
        /// <summary>Максимум одной позиции — защита от абсурдных количеств.</summary>
        private const int MaxQuantityPerItem = 10;

        private static string? NormalizeEdition(string? code) => string.IsNullOrWhiteSpace(code) ? null : code.Trim();

        private static string? NormalizeOffer(string? key) => string.IsNullOrWhiteSpace(key) ? null : key.Trim();

        private static string? NormalizeCountry(string? code) => code is { Length: 2 } ? code.ToUpperInvariant() : null;

        /// <summary>Строка заказа после сверки с каталогом: игра, издание и вариант в каноническом виде.</summary>
        private sealed class ResolvedLine
        {
            public ResolvedLine(Game game, GameEdition? edition, bool editionIsDefault, string? offerKey, SuperBot.Core.Regions.RegionPolicy? offerPolicy)
            {
                Game = game;
                Edition = edition;
                EditionIsDefault = editionIsDefault;
                OfferKey = offerKey;
                OfferPolicy = offerPolicy;
            }

            public Game Game { get; }
            public GameEdition? Edition { get; }
            public bool EditionIsDefault { get; }
            public string? OfferKey { get; }
            public SuperBot.Core.Regions.RegionPolicy? OfferPolicy { get; }
            public int Quantity { get; set; }
        }

        private readonly IGameRepository _gameRepository;
        private readonly IGameDetailsRepository _gameDetailsRepository;
        private readonly IGameDiscountRepository _gameDiscountRepository;
        private readonly IPromoCodeService _promoCodeService;
        private readonly StorefrontCurrencyOptions _currencies;
        private readonly IFxRateService _fxRates;
        private readonly FxOptions _fx;
        private readonly SuperBot.Core.Regions.IRegionCatalogProvider _regions;
        private readonly ILogger<CheckoutPricingService> _logger;

        public CheckoutPricingService(
            IGameRepository gameRepository,
            IGameDetailsRepository gameDetailsRepository,
            IGameDiscountRepository gameDiscountRepository,
            IPromoCodeService promoCodeService,
            IOptions<StorefrontCurrencyOptions> currencies,
            IFxRateService fxRates,
            IOptionsSnapshot<FxOptions> fx,
            SuperBot.Core.Regions.IRegionCatalogProvider regions,
            ILogger<CheckoutPricingService> logger)
        {
            _regions = regions;
            _gameRepository = gameRepository;
            _gameDetailsRepository = gameDetailsRepository;
            _gameDiscountRepository = gameDiscountRepository;
            _promoCodeService = promoCodeService;
            _currencies = currencies.Value;
            _fxRates = fxRates;
            _fx = fx.Value;
            _logger = logger;
        }

        public async Task<CheckoutPricingResult> PriceAsync(CheckoutPricingRequest request)
        {
            var requested = (request.Items ?? new List<CheckoutPricingItem>())
                .Where(item => !string.IsNullOrWhiteSpace(item.GameId))
                .ToList();

            if (requested.Count == 0)
            {
                return CheckoutPricingResult.Fail("Cart is empty.", "checkout.cartEmpty");
            }

            if (requested.Count > MaxLineItems)
            {
                return CheckoutPricingResult.Fail("Too many items in cart.", "checkout.tooManyItems");
            }

            if (requested.Any(item => item.Quantity <= 0 || item.Quantity > MaxQuantityPerItem))
            {
                return CheckoutPricingResult.Fail($"Quantity must be between 1 and {MaxQuantityPerItem}.", "checkout.quantityRange", new { max = MaxQuantityPerItem });
            }

            var gameIds = requested.Select(item => item.GameId.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            var games = await _gameRepository.GetByIdsAsync(gameIds);
            var gameById = games
                .Where(game => !string.IsNullOrWhiteSpace(game.Id))
                .ToDictionary(game => game.Id!, StringComparer.OrdinalIgnoreCase);

            var missing = gameIds.Where(id => !gameById.ContainsKey(id)).ToList();
            if (missing.Count > 0)
            {
                return CheckoutPricingResult.Fail("Some items are no longer available.", "checkout.itemsUnavailable");
            }

            var discounts = await _gameDiscountRepository.GetByGameIdsAsync(gameIds);
            var discountByGameId = discounts
                .Where(discount => !string.IsNullOrWhiteSpace(discount.GameId))
                .ToDictionary(discount => discount.GameId!, StringComparer.OrdinalIgnoreCase);

            // Валюта одна на весь заказ и берётся из списка витрины: смешивать в одном
            // платеже позиции в разных валютах нельзя — провайдер списывает одной суммой.
            var currency = _currencies.Resolve(request.Currency);
            var utcNow = DateTime.UtcNow;
            var lineItems = new List<CheckoutLineItem>();

            // Карточки игр нужны только строкам с изданием — цена издания и его состав живут там.
            var detailsByGameId = new Dictionary<string, GameDetails>(StringComparer.OrdinalIgnoreCase);
            foreach (var gameId in requested.Where(item => NormalizeEdition(item.EditionCode) is not null).Select(item => item.GameId.Trim()).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                var details = await _gameDetailsRepository.GetByGameIdAsync(gameId);
                if (details is not null)
                {
                    detailsByGameId[gameId] = details;
                }
            }

            // Позиция — игра + издание + региональный вариант: Standard и Deluxe одной игры, как и
            // европейский с глобальным ключом, — разные строки заказа, разные цены и разные ключи.
            // Дубликаты одной тройки схлопываем, чтобы обойти лимит количества было нельзя.
            //
            // Схлопываем по КАНОНИЧЕСКИМ значениям — id игры из каталога, коду издания как он записан в карточке,
            // ключу варианта в виде витрины, — а не по тому, что прислал клиент. Раньше сравнение шло по строкам
            // запроса с учётом регистра: «deluxe» и «DELUXE» давали две строки заказа в обход лимита, а вторая
            // ещё и не выдавалась — склад ищет издание точным сравнением.
            var buyerCountry = NormalizeCountry(request.BuyerCountry);
            var lines = new Dictionary<(string GameId, string? Edition, string? Offer), ResolvedLine>();
            foreach (var item in requested)
            {
                var game = gameById[item.GameId.Trim()];
                var title = !string.IsNullOrWhiteSpace(game.Title) ? game.Title : (game.Name ?? "Game");

                GameEdition? edition = null;
                var editionIsDefault = false;
                var requestedEdition = NormalizeEdition(item.EditionCode);
                if (requestedEdition is not null)
                {
                    detailsByGameId.TryGetValue(game.Id!, out var details);
                    edition = GameEditions.Resolve(details?.Editions, requestedEdition);
                    if (edition is null)
                    {
                        return CheckoutPricingResult.Fail($"“{title}”: this edition is no longer available.", "checkout.editionUnavailable", new { title });
                    }
                    editionIsDefault = GameEditions.IsDefaultIn(details?.Editions, edition);
                }

                // Выбранный вариант ключа. Ключ разбираем сами, а не ищем на складе: распроданная
                // партия не должна превращаться в отказ — заказ, как и прежде, подождёт пополнения.
                // Неразбираемый ключ — отказ: он пришёл от клиента, и молча продать «что-нибудь»
                // вместо выбранного покупателем нельзя.
                SuperBot.Core.Regions.RegionPolicy? offerPolicy = null;
                string? lineOfferKey = null;
                var requestedOffer = NormalizeOffer(item.OfferKey);
                if (requestedOffer is not null)
                {
                    if (!SuperBot.Core.Regions.RegionOffer.TryParseKey(requestedOffer, out offerPolicy))
                    {
                        return CheckoutPricingResult.Fail($"“{title}”: this key region is no longer available.", "checkout.offerUnavailable", new { title });
                    }
                    // В заказ кладём ключ в виде витрины: «default» — политика игры, у разобранной политики —
                    // её канонический ключ (страны в верхнем регистре, отсортированы). По нему же ищет склад.
                    lineOfferKey = offerPolicy is null
                        ? SuperBot.Core.Regions.RegionOffer.NormalizeKey(requestedOffer, game.RegionPolicy)
                        : SuperBot.Core.Regions.RegionOffer.KeyOf(offerPolicy);
                }

                var key = (game.Id!, edition?.Code, lineOfferKey);
                if (lines.TryGetValue(key, out var existing))
                {
                    existing.Quantity += item.Quantity;
                }
                else
                {
                    lines[key] = new ResolvedLine(game, edition, editionIsDefault, lineOfferKey, offerPolicy) { Quantity = item.Quantity };
                }
            }

            if (lines.Values.Any(line => line.Quantity > MaxQuantityPerItem))
            {
                return CheckoutPricingResult.Fail($"Quantity must be between 1 and {MaxQuantityPerItem}.", "checkout.quantityRange", new { max = MaxQuantityPerItem });
            }

            foreach (var line in lines.Values)
            {
                var game = line.Game;
                var gameId = game.Id!;
                var edition = line.Edition;
                var offerKey = line.OfferKey;
                var quantity = line.Quantity;

                // В заказе должно стоять ТО ЖЕ название, что покупатель видел на витрине,
                // а витрина (каталог, карточка игры, рекомендации) показывает Title.
                // Раньше сюда попадал Name — и в чеке оказывалось другое имя товара.
                var title = !string.IsNullOrWhiteSpace(game.Title) ? game.Title : (game.Name ?? "Game");

                // Невышедшие игры видны на витрине, но не продаются. Прайсинг — единая точка
                // всех оплат (Stripe, крипто), поэтому запрет живёт именно здесь.
                if (SuperBot.Core.Services.GameRelease.IsUpcoming(game.ReleaseDate, utcNow))
                {
                    return CheckoutPricingResult.Fail($"“{title}” isn't released yet.", "checkout.notReleased", new { title });
                }

                // Регион: политика игры должна пропускать страну покупателя — вопрос «продаём ли
                // вообще в эту страну».
                if (buyerCountry is not null && (game.RegionPolicy ?? SuperBot.Core.Regions.RegionPolicy.Anywhere()).Blocks(buyerCountry, _regions.Current))
                {
                    return CheckoutPricingResult.Fail($"“{title}” can't be activated in your country ({buyerCountry}).", "checkout.notInCountry", new { title, country = buyerCountry });
                }

                string? offerTitle = null;
                if (offerKey is not null)
                {
                    // «default» — политика самой игры: подписываем вариант так же, как витрина.
                    var effective = line.OfferPolicy ?? game.RegionPolicy;
                    offerTitle = SuperBot.Core.Regions.RegionOffer.TitleOf(effective, _regions.Current);

                    // Покупатель мог выбрать вариант, который в его стране не активируется, — на
                    // витрине такие показаны с пометкой. Продавать заведомо мёртвый ключ нельзя.
                    if (buyerCountry is not null && effective is not null && effective.Blocks(buyerCountry, _regions.Current))
                    {
                        return CheckoutPricingResult.Fail($"“{title}” ({offerTitle}) can't be activated in your country ({buyerCountry}).", "checkout.offerNotInCountry", new { title, offer = offerTitle, country = buyerCountry });
                    }
                }

                discountByGameId.TryGetValue(gameId, out var discount);
                var discountActive = discount is not null && discount.IsActiveAt(utcNow);
                var discountPercent = discountActive ? discount!.DiscountPercent : (decimal?)null;

                // Цена берётся из прайс-листа игры (или издания). Нет цены в этой валюте — отказ, а не пересчёт
                // и не молчаливый откат к базовой: списать 59.99 в валюте, где это другие деньги,
                // хуже, чем честно сказать «в этой валюте не продаём».
                decimal? price;
                if (edition is not null)
                {
                    // Те же правила, что на странице: своя скидка издания важнее общей скидки игры.
                    if (edition.DiscountPercent is > 0)
                    {
                        discountPercent = edition.DiscountPercent;
                    }
                    // Вариант с изданием: региональная цена издания, иначе цена издания. Без издания в аргументах
                    // строка «Deluxe + Europe» без своей региональной цены уходила бы по цене базовой игры.
                    price = offerKey is not null
                        ? RegionOfferPricing.TryGetPrice(game, offerKey, edition.Code, currency, _fxRates.Current(), _fx, edition, line.EditionIsDefault)
                        : GamePricing.TryGetEditionPrice(edition, game, currency, _fxRates.Current(), _fx);
                    title = $"{title} — {edition.Title}";
                }
                else
                {
                    // Цена варианта, если он выбран; иначе — цена игры. Тот же RegionOfferPricing,
                    // что считает цену на карточке и в корзине: разойтись им нельзя.
                    price = offerKey is not null
                        ? RegionOfferPricing.TryGetPrice(game, offerKey, null, currency, _fxRates.Current(), _fx)
                        : GamePricing.TryGetPrice(game, currency, _fxRates.Current(), _fx);
                }
                if (price is null)
                {
                    _logger.LogWarning(
                        "Нет цены для игры {GameId} в валюте {Currency} — чекаут отклонён.", gameId, currency);
                    return CheckoutPricingResult.Fail($"“{title}” isn't available in {currency}.", "checkout.currencyUnavailable", new { title, currency });
                }

                var unitPrice = price.Value;
                var finalUnitPrice = CalculateFinalPrice(unitPrice, discountPercent);
                if (finalUnitPrice < 0)
                {
                    return CheckoutPricingResult.Fail("Invalid price configuration.", "checkout.invalidPrice");
                }

                lineItems.Add(new CheckoutLineItem
                {
                    // Игра или ПО (подписка — отдельно): по типу строки выбирается налоговый код и подписи в заказе.
                    ProductType = ProductTypes.For(game.Kind, edition),
                    GameId = gameId,
                    // Код издания — как в карточке, и у издания по умолчанию тоже. Раньше у него код обнулялся, и
                    // выдача искала только ключи без кода, хотя наличие считалось «с кодом + без кода»: ключи,
                    // залитые под код издания по умолчанию, показывались в наличии, но не выдавались. Ключи без
                    // кода (залитые до появления изданий) выдача издания по умолчанию подбирает сама, см. KeyFulfillmentService.
                    EditionCode = edition?.Code,
                    EditionTitle = edition?.Title,
                    OfferKey = offerKey,
                    OfferTitle = offerTitle,
                    Title = title,
                    CoverUrl = game.ImagePath,
                    Quantity = quantity,
                    UnitPrice = unitPrice,
                    DiscountPerUnit = unitPrice - finalUnitPrice,
                    FinalUnitPrice = finalUnitPrice,
                    LineTotal = finalUnitPrice * quantity,
                    Currency = currency
                });
            }

            var subtotal = lineItems.Sum(item => item.UnitPrice * item.Quantity);
            var itemDiscountTotal = lineItems.Sum(item => item.DiscountPerUnit * item.Quantity);
            var afterItemDiscounts = lineItems.Sum(item => item.LineTotal);

            // Промокод считает существующий сервис — от суммы УЖЕ со скидками каталога.
            var promoDiscount = 0m;
            var promoApplied = false;
            string? normalizedPromo = null;
            string? promoMessage = null;
            string? promoMessageCode = null;

            if (!string.IsNullOrWhiteSpace(request.PromoCode))
            {
                var validation = await _promoCodeService.ValidateAsync(new PromoValidationRequest
                {
                    Code = request.PromoCode.Trim(),
                    CartSubtotal = afterItemDiscounts,
                    UserName = request.UserName,
                    // Промокод на фиксированную сумму — это сумма в конкретной валюте.
                    // Без валюты в запросе «минус 10» в евро дало бы совсем не ту скидку.
                    Currency = currency
                });

                promoMessage = validation.Message;
                promoMessageCode = validation.MessageCode;
                if (validation.Valid)
                {
                    promoApplied = true;
                    normalizedPromo = validation.NormalizedCode ?? request.PromoCode.Trim().ToUpperInvariant();
                    promoDiscount = Math.Max(0m, Math.Min(validation.DiscountAmount, afterItemDiscounts));
                }
            }

            var taxTotal = 0m;
            var total = afterItemDiscounts - promoDiscount + taxTotal;
            if (total < 0)
            {
                total = 0m;
            }

            // Точность округления берём у валюты, а не из константы: у JPY и XTR дробной части нет.
            total = CurrencyMinorUnits.Round(total, currency);

            // Центы считаем один раз и здесь же — дальше сумма никем не пересчитывается.
            var amountMinorUnits = CurrencyMinorUnits.ToMinor(total, currency);
            if (amountMinorUnits <= 0)
            {
                return CheckoutPricingResult.Fail("Order total must be greater than zero.", "checkout.totalZero");
            }

            return new CheckoutPricingResult
            {
                Success = true,
                BuyerCountry = NormalizeCountry(request.BuyerCountry),
                Items = lineItems,
                Currency = currency,
                Subtotal = subtotal,
                DiscountTotal = itemDiscountTotal + promoDiscount,
                TaxTotal = taxTotal,
                Total = total,
                AmountMinorUnits = amountMinorUnits,
                PromoApplied = promoApplied,
                NormalizedPromoCode = normalizedPromo,
                PromoMessage = promoMessage,
                PromoMessageCode = promoMessageCode
            };
        }

        /// <summary>Цена в чекауте обязана совпадать с витриной — формула общая на весь проект.</summary>
        private static decimal CalculateFinalPrice(decimal price, decimal? discountPercent) =>
            SuperBot.Core.Services.PriceCalculator.FinalPrice(price, discountPercent);
    }
}
