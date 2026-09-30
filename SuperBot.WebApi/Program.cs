using Hangfire;
using Hangfire.Mongo;
using Hangfire.Mongo.Migration.Strategies.Backup;
using Hangfire.Mongo.Migration.Strategies;
using MongoDB.Driver;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;
using SuperBot.Infrastructure.ExternalServices;
using SuperBot.Infrastructure.Models;
using SuperBot.Infrastructure.Repositories;
using SuperBot.Infrastructure.Services;
using SuperBot.WebApi.Services;
using Microsoft.Extensions.FileProviders;
using SuperBot.Core.Entities;
using SuperBot.Common.Auth;
using Microsoft.AspNetCore.Authentication;
using Stripe;
using Microsoft.AspNetCore.HttpOverrides;
using SuperBot.WebApi.Support;
using SuperBot.WebApi.Support.Infrastructure;
using SuperBot.WebApi.Support.Services;
using SuperBot.WebApi.Services.Analytics;
using Microsoft.AspNetCore.Diagnostics;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Bson;
using Microsoft.AspNetCore.DataProtection;

var builder = WebApplication.CreateBuilder(args);

// --- Обязательные настройки ---
//
// Проверяем первым делом, до регистрации сервисов: незаполненная переменная окружения раньше
// означала не отказ, а тихо работающее вполсилы приложение — docker подставляет пустую строку,
// сервис поднимается, а ломается это гораздо позже, у покупателя на странице. Так разворачивать
// нельзя: нет настройки — нет запуска.
//
// Заглушка "__SET_VIA_ENV__" из appsettings.json считается таким же отсутствием: это прямое
// указание, что настоящее значение должно приехать из окружения.
//
// Список намеренно короткий — только то, без чего приложение неработоспособно целиком.
// Логгера на этом этапе ещё нет, поэтому пишем в stderr и падаем: сообщение видно в
// docker logs первым же, а не среди стартовых строк.
{
    const string mustComeFromEnvironment = "__SET_VIA_ENV__";
    var requiredSettings = new[]
    {
        ("ConnectionStrings:MongoDb", "MongoDB connection string"),
        ("ConnectionStrings:Name", "MongoDB database name"),
        ("Keycloak:Admin:BaseUrl", "internal Keycloak address"),
        ("Keycloak:Admin:Realm", "Keycloak realm"),
        ("Keycloak:Admin:ClientId", "Keycloak service client id"),
        ("Keycloak:Admin:ClientSecret", "Keycloak service client secret (KEYCLOAK_ADMIN_CLIENT_SECRET in .env)"),
    };

    var missingSettings = requiredSettings
        .Where(setting =>
        {
            var value = builder.Configuration[setting.Item1];
            return string.IsNullOrWhiteSpace(value) || value.Trim() == mustComeFromEnvironment;
        })
        .Select(setting => $"  - {setting.Item1}: {setting.Item2}")
        .ToList();

    if (missingSettings.Count > 0)
    {
        var configurationError = "Required configuration is missing:" + Environment.NewLine
            + string.Join(Environment.NewLine, missingSettings) + Environment.NewLine
            + "Fill these in .env (see .env.example) and restart. The application refuses to start on purpose: "
            + "with empty settings it would run half-broken and fail later, in front of customers.";

        Console.Error.WriteLine(configurationError);
        throw new InvalidOperationException(configurationError);
    }
}

try
{
    BsonSerializer.RegisterSerializer(new GuidSerializer(GuidRepresentation.Standard));
}
catch (BsonSerializationException)
{
    // Serializer may already be registered by test host / warm reload.
}

// За nginx: схема запроса приходит заголовком X-Forwarded-Proto (адрес клиента — см. ClientAddress).
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
});

// Add services to the container.
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    // Полные имена: одноимённые DTO разных контроллеров иначе конфликтуют в схеме Swagger.
    options.CustomSchemaIds(type => type.FullName);
});

builder.Services.AddMemoryCache();


// CORS: фронт с того же домена за nginx и дев-сервер на :3000.
builder.Services.AddCors(options =>
{
    var frontendConfigSection = builder.Configuration.GetSection("FrontendConfiguration");
    options.AddPolicy("AllowSpecificOrigin",
        builder =>
        {
            var configuredOrigin = frontendConfigSection.GetValue<string>("Uri");
            var allowedOrigins = new List<string>
            {
                "https://localhost:3000",
                "http://localhost:3000"
            };
            if (!string.IsNullOrWhiteSpace(configuredOrigin))
            {
                allowedOrigins.Add(configuredOrigin);
            }

            builder.WithOrigins(allowedOrigins.Distinct().ToArray())
                   .AllowAnyHeader()
                   .AllowAnyMethod()
                   .AllowCredentials();
        });
});

builder.Services.Configure<StripeSettings>(builder.Configuration.GetSection("Stripe"));
// Валюты витрины: базовая и список доступных покупателю. Включать валюту здесь можно только
// когда прайс-листы под неё заполнены — иначе чекаут откажет на первой же корзине.
builder.Services.Configure<SuperBot.Core.Payments.FxOptions>(builder.Configuration.GetSection("Storefront:Fx"));
builder.Services.AddSingleton<SuperBot.Infrastructure.Services.IFxRateService, SuperBot.Infrastructure.Services.FxRateService>();
// Суточный импорт курсов. Адрес источника пуст — импорта нет, курсы правит человек через админку.
builder.Services.AddHttpClient<SuperBot.Infrastructure.Services.IFxRateImportService, SuperBot.Infrastructure.Services.FxRateImportService>();
builder.Services.Configure<SuperBot.Core.Payments.StorefrontCurrencyOptions>(
    builder.Configuration.GetSection("Storefront"));

// Настройки, которые владелец меняет из админки (часы поддержки, бюджет LLM, наценка курса, рельсы):
// лежат в Mongo и накладываются поверх конфига через Options-конвейер; IOptionsMonitor видит
// изменение сразу после сохранения. См. SiteSettingsStore.
builder.Services.AddSingleton<SuperBot.WebApi.Services.SiteSettings.SiteSettingsStore>();
builder.Services.Configure<SuperBot.WebApi.Services.SiteSettings.PaymentRailsOptions>(builder.Configuration.GetSection("PaymentRails"));

// Реквизиты продавца для юридических документов витрины. Любое поле перекрывается
// переменной окружения вида Legal__Entity — в docker-compose так и задаётся.
builder.Services.Configure<SuperBot.WebApi.Services.SiteSettings.LegalOptions>(builder.Configuration.GetSection("Legal"));
builder.Services.AddSingleton<Microsoft.Extensions.Options.IPostConfigureOptions<SuperBot.WebApi.Support.Chat.SupportChatOptions>, SuperBot.WebApi.Services.SiteSettings.SupportChatOptionsOverlay>();
builder.Services.AddSingleton<Microsoft.Extensions.Options.IOptionsChangeTokenSource<SuperBot.WebApi.Support.Chat.SupportChatOptions>, SuperBot.WebApi.Services.SiteSettings.SupportChatOptionsOverlay>();
builder.Services.AddSingleton<Microsoft.Extensions.Options.IPostConfigureOptions<SuperBot.Core.Payments.FxOptions>, SuperBot.WebApi.Services.SiteSettings.FxOptionsOverlay>();
builder.Services.AddSingleton<Microsoft.Extensions.Options.IOptionsChangeTokenSource<SuperBot.Core.Payments.FxOptions>, SuperBot.WebApi.Services.SiteSettings.FxOptionsOverlay>();
builder.Services.AddSingleton<Microsoft.Extensions.Options.IPostConfigureOptions<SuperBot.WebApi.Services.SiteSettings.PaymentRailsOptions>, SuperBot.WebApi.Services.SiteSettings.PaymentRailsOverlay>();
builder.Services.AddSingleton<Microsoft.Extensions.Options.IOptionsChangeTokenSource<SuperBot.WebApi.Services.SiteSettings.PaymentRailsOptions>, SuperBot.WebApi.Services.SiteSettings.PaymentRailsOverlay>();
builder.Services.Configure<SuperBot.WebApi.Services.SiteSettings.StockOptions>(builder.Configuration.GetSection("Storefront:Stock"));
builder.Services.AddSingleton<Microsoft.Extensions.Options.IPostConfigureOptions<SuperBot.WebApi.Services.SiteSettings.StockOptions>, SuperBot.WebApi.Services.SiteSettings.StockOptionsOverlay>();
builder.Services.AddSingleton<Microsoft.Extensions.Options.IOptionsChangeTokenSource<SuperBot.WebApi.Services.SiteSettings.StockOptions>, SuperBot.WebApi.Services.SiteSettings.StockOptionsOverlay>();
builder.Services.Configure<SuperBot.WebApi.Services.Regions.RegionCatalogOptions>(builder.Configuration.GetSection("Storefront"));
builder.Services.AddSingleton<SuperBot.Core.Regions.IRegionCatalogProvider, SuperBot.WebApi.Services.Regions.RegionCatalogProvider>();


// Ключи DataProtection — на диск, а не в память контейнера.
//
// По умолчанию ASP.NET складывает их во временную папку контейнера и честно предупреждает об
// этом в логе при каждом старте: «Storing keys in a directory that may not be persisted».
// Пока вход идёт по JWT из Keycloak, это почти незаметно — но всё, что шифруется или
// подписывается DataProtection (antiforgery, защищённые ссылки, куки), между перезапусками и
// между несколькими инстансами не переживёт: у каждого свой набор ключей.
//
// SetApplicationName обязателен: без него имя берётся из пути к приложению, и два инстанса
// одного сервиса считают ключи чужими даже на общем томе.
var dataProtectionKeys = builder.Configuration["DataProtection:KeysPath"] ?? "/app/keys";
try
{
    Directory.CreateDirectory(dataProtectionKeys);
    builder.Services.AddDataProtection()
        .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionKeys))
        .SetApplicationName("tale-shop-web");
}
catch (Exception exception)
{
    // Каталог недоступен (права, только-чтение) — работаем как раньше, во временной папке.
    // Ронять из-за этого запуск нельзя: сервис без DataProtection всё равно обслуживает магазин.
    Console.WriteLine($"DataProtection: keys stay in the container ({exception.Message}).");
}

builder.Services.AddControllers();
builder.Services.Configure<SupportOptions>(builder.Configuration.GetSection("Support"));
builder.Services.Configure<SupportRoleOptions>(builder.Configuration.GetSection("Support:Roles"));
builder.Services.Configure<SuperBot.WebApi.Support.Chat.SupportChatOptions>(builder.Configuration.GetSection("SupportChat"));

// MediatR/бот-хендлеры живут в бот-сервисе. Сайт команд не отправляет — регистрация не нужна.

// Telegram/бот полностью вынесен в SuperBot.BotApi. Сайт общается с ботом только событиями (outbox).
// Публичные URL сайта (MainUrl) — нужны, например, реферальным ссылкам.
builder.Services.AddSingleton<IUrlService, UrlProvider>();

// Крипто-оплата (BTCPay, testnet DEMO). Не настроено — фича выключена, фронт кнопку не показывает.
builder.Services.Configure<BtcPayOptions>(builder.Configuration.GetSection("BtcPay"));
builder.Services.AddHttpClient<BtcPayClient>();


builder.Services.AddSingleton<IMongoClient, MongoClient>(sp =>
{
    var connectionString = builder.Configuration.GetSection("ConnectionStrings:MongoDb").Value;
    return new MongoClient(connectionString);
});
//  MongoDatabase
builder.Services.AddScoped<IMongoDatabase>(sp =>
{
    var mongoClient = sp.GetRequiredService<IMongoClient>();

    var mongoName = builder.Configuration.GetSection("ConnectionStrings:Name").Value;
    return mongoClient.GetDatabase(mongoName);
});
builder.Services.AddScoped<MongoDbInitializer>();
builder.Services.AddScoped<AdminDashboardService>();
builder.Services.AddScoped<AdminPeriodReportService>();
builder.Services.AddScoped<AdminGameSalesReportService>();
builder.Services.AddScoped<AdminInventoryValueReportService>();
builder.Services.AddScoped<AdminFunnelReportService>();
builder.Services.AddScoped<AdminChannelReportService>();
builder.Services.AddScoped<AdminAbandonedCartsService>();
builder.Services.AddScoped<AdminChannelSpendService>();
// Напоминания о брошенных корзинах: отправка только по нажатию из админки, фонового
// воркера у неё нет намеренно.
builder.Services.AddScoped<AbandonedCartReminderService>();
builder.Services.AddScoped<SuperBot.WebApi.Mail.IAbandonedCartMailer, SuperBot.WebApi.Mail.AbandonedCartMailService>();

// Приглашения оставить отзыв: письмо через неделю после выдачи ключа. В отличие от
// напоминаний о корзине, здесь есть фоновая задача — письмо про собственную покупку
// человека, и выбирать по каждому заказу нечего. Выключено, пока ReviewInvites:Enabled
// не выставлен явно.
builder.Services.Configure<SuperBot.WebApi.Services.ReviewInvites.ReviewInviteOptions>(
    builder.Configuration.GetSection("ReviewInvites"));
builder.Services.AddScoped<SuperBot.WebApi.Mail.IReviewInviteMailer, SuperBot.WebApi.Mail.ReviewInviteMailService>();
builder.Services.AddSingleton<SuperBot.WebApi.Services.ReviewInvites.IReviewInviteTokenService,
    SuperBot.WebApi.Services.ReviewInvites.ReviewInviteTokenService>();
builder.Services.AddScoped<SuperBot.WebApi.Services.ReviewInvites.ReviewInviteService>();

// Цифры страницы «О нас» (каталог, выданные ключи, страны, скорость поддержки) — считаются
// агрегатами по базе, а не вписаны в разметку.
builder.Services.AddScoped<SuperBot.WebApi.Services.AboutStatsService>();
// Аватары авторов отзывов: в самом отзыве их нет, берутся из профиля в момент показа.
builder.Services.AddScoped<SuperBot.WebApi.Services.UserAvatarLookup>();
builder.Services.AddScoped<SuperBot.WebApi.Services.UserAvatarStore>();
builder.Services.AddScoped<SuperBot.Core.Interfaces.IPurchaseAnalytics, SuperBot.Infrastructure.Services.Analytics.Ga4PurchaseAnalytics>();
builder.Services.AddScoped<AdminOrderActionsService>();
builder.Services.AddScoped<AdminCustomerService>();
// Фоновые проверки здоровья: письмо владельцу, когда зависимость отваливается.
builder.Services.AddScoped<SuperBot.WebApi.Services.Health.ServiceHealthMonitor>();

builder.Services.AddScoped<IGameRepository, GameMongoDbRepository>();
builder.Services.AddScoped<IGameDiscountRepository, GameDiscountMongoDbRepository>();
// Курсы валют: история снимков, по которой потом разбирают спорные заказы.
builder.Services.AddScoped<IFxRateRepository, FxRateMongoDbRepository>();
builder.Services.AddScoped<IGameDetailsRepository, GameDetailsMongoDbRepository>();
builder.Services.AddScoped<IMediaAssetRepository, MediaAssetMongoDbRepository>();
builder.Services.AddScoped<IImageMetadataReader, ImageMetadataReader>();
builder.Services.AddScoped<IOrderRepository, OrderMongoDbRepository>();
builder.Services.AddScoped<IBlogRepository, BlogMongoDbRepository>();
builder.Services.AddScoped<IBlogHomepageSettingsRepository, BlogHomepageSettingsMongoDbRepository>();
builder.Services.AddScoped<IDealOfWeekSettingsRepository, DealOfWeekSettingsMongoDbRepository>();
builder.Services.AddScoped<ITarotSettingsRepository, TarotSettingsMongoDbRepository>();
builder.Services.AddScoped<ITarotDrawRepository, TarotDrawMongoDbRepository>();
builder.Services.AddScoped<IBlogEventRepository, BlogEventMongoDbRepository>();
builder.Services.AddScoped<IBlogPostUniqueViewRepository, BlogPostUniqueViewMongoDbRepository>();
builder.Services.AddScoped<IBlogCommentRepository, BlogCommentMongoDbRepository>();
builder.Services.AddScoped<IBlogViewSettingsRepository, BlogViewSettingsMongoDbRepository>();
builder.Services.AddScoped<IUserBlogProfileRepository, UserBlogProfileMongoDbRepository>();
builder.Services.AddScoped<IAnalyticsSettingsRepository, AnalyticsSettingsMongoDbRepository>();
builder.Services.AddScoped<IUserRepository, UserMongoDbRepository>();
builder.Services.AddScoped<IWishlistRepository, WishlistMongoDbRepository>();
builder.Services.AddScoped<IViewedGameRepository, ViewedGameMongoDbRepository>();
builder.Services.AddScoped<IGameKeyRepository, GameKeyMongoDbRepository>();
builder.Services.AddScoped<ITelegramLinkRepository, TelegramLinkMongoDbRepository>();
// Выдача ключей: из пула инвентаря. Публикует событие доставки в outbox — Telegram шлёт бот-сервис.
builder.Services.AddScoped<IKeyFulfillmentService, KeyFulfillmentService>();
// Единое ядро финализации платежа (создать заказ + выдать ключи). Используют И клиентский
// confirm-payment-intent, И Stripe-вебхук — идемпотентно, без дублей заказа.
builder.Services.AddScoped<IOrderFinalizationService, OrderFinalizationService>();
// Ценообразование чекаута: единственное место, где считается сумма к списанию.
// Клиент присылает только gameId+quantity — цены берутся из каталога.
builder.Services.AddScoped<ICheckoutPricingService, CheckoutPricingService>();
// Возвраты и чарджбеки: приводят заказ в соответствие с состоянием платежа после оплаты.
builder.Services.AddScoped<IPaymentReconciliationService, PaymentReconciliationService>();
// Кэшбэк: журнал начислений и трат, баланс считается из него. Начисление — когда ключи выданы
// (наблюдатель выдачи), забираем — при возврате и споре; ежечасная задача догоняет пропущенное.
builder.Services.Configure<SuperBot.Core.Cashback.CashbackOptions>(builder.Configuration.GetSection("Cashback"));
// Включение, дата запуска, сроки и уровни правятся в панели (Site settings) поверх конфига, без рестарта.
builder.Services.AddSingleton<Microsoft.Extensions.Options.IPostConfigureOptions<SuperBot.Core.Cashback.CashbackOptions>, SuperBot.WebApi.Services.SiteSettings.CashbackOptionsOverlay>();
builder.Services.AddSingleton<Microsoft.Extensions.Options.IOptionsChangeTokenSource<SuperBot.Core.Cashback.CashbackOptions>, SuperBot.WebApi.Services.SiteSettings.CashbackOptionsOverlay>();
builder.Services.AddScoped<SuperBot.Core.Cashback.ICashbackLedger, SuperBot.Infrastructure.Services.CashbackLedgerService>();
builder.Services.AddScoped<SuperBot.Infrastructure.Services.ICashbackCurrency, SuperBot.Infrastructure.Services.CashbackCurrency>();
builder.Services.AddScoped<SuperBot.Infrastructure.Services.ICashbackOrderEvents, SuperBot.Infrastructure.Services.CashbackOrderEvents>();
builder.Services.AddScoped<SuperBot.Core.Interfaces.IOrderFulfillmentObserver>(provider =>
    provider.GetRequiredService<SuperBot.Infrastructure.Services.ICashbackOrderEvents>());
builder.Services.AddScoped<SuperBot.Infrastructure.Services.ICashbackSyncService, SuperBot.Infrastructure.Services.CashbackSyncService>();
// Письма о кэшбэке: «стал доступен» и «скоро сгорит», со своей отпиской.
builder.Services.AddScoped<SuperBot.WebApi.Mail.ICashbackNoticeMailer, SuperBot.WebApi.Mail.CashbackNoticeMailService>();
builder.Services.AddSingleton<SuperBot.WebApi.Services.Cashback.CashbackNoticeTokens>();
builder.Services.AddScoped<SuperBot.WebApi.Services.Cashback.CashbackNoticeService>();
// Stripe Tax: налог внутри цен. Предварительный расчёт на кассе, транзакция после оплаты, сторно при возврате.
builder.Services.Configure<SuperBot.Infrastructure.Services.TaxOptions>(builder.Configuration.GetSection("Tax"));
builder.Services.AddScoped<SuperBot.Infrastructure.Services.IStripeTaxGateway, SuperBot.Infrastructure.Services.StripeTaxGateway>();
builder.Services.AddScoped<SuperBot.Infrastructure.Services.IOrderTaxService, SuperBot.Infrastructure.Services.OrderTaxService>();
builder.Services.AddScoped<SuperBot.Infrastructure.Services.ITaxSyncService, SuperBot.Infrastructure.Services.TaxSyncService>();
// Дедупликация вебхуков: Stripe доставляет события «хотя бы один раз».
builder.Services.AddScoped<IStripeEventLog, StripeEventLog>();
// Шов к Stripe: единственное место обращения к их SDK. В тестах подменяется фейком.
builder.Services.AddScoped<IStripePaymentIntentGateway, StripePaymentIntentGateway>();
// Клиент и карты кабинета — тем же швом: контроллер не создаёт сервисы Stripe сам.
builder.Services.AddScoped<SuperBot.Infrastructure.Services.IStripeCustomerGateway, SuperBot.Infrastructure.Services.StripeCustomerGateway>();
builder.Services.AddScoped<SuperBot.WebApi.Services.IBillingCustomers, SuperBot.WebApi.Services.BillingCustomers>();
// Гостевая покупка: ключи выдаются после подтверждения почты по HMAC-ссылке из письма.
builder.Services.AddSingleton<IDeliveryVerificationTokenService, DeliveryVerificationTokenService>();
builder.Services.AddScoped<IDeliveryMailer, SuperBot.WebApi.Mail.DeliveryMailService>();
// Авто-возврат гостевых заказов с неподтверждённой почтой (48ч). Запускает Hangfire (ниже).
builder.Services.AddScoped<IUnverifiedOrderRefundService, UnverifiedOrderRefundService>();
// Уборка протухших промокодов «карты удачи». Запускает Hangfire (ниже).
builder.Services.AddScoped<ITarotMaintenanceService, TarotMaintenanceService>();
// Event-outbox: сайт только ПУБЛИКУЕТ события; консюмер (BotOutboxWorker) живёт в бот-сервисе.
builder.Services.AddScoped<IBotEventPublisher, MongoBotEventPublisher>();
builder.Services.AddScoped<IGameReviewRepository, GameReviewMongoDbRepository>();
builder.Services.AddScoped<IGameReviewHelpfulRepository, GameReviewHelpfulMongoDbRepository>();
builder.Services.AddScoped<IGameReviewReportRepository, GameReviewReportMongoDbRepository>();
builder.Services.AddScoped<IGameTrackingRepository, GameTrackingMongoDbRepository>();
// Собранный каталог для витрины. Сам объект кэшируется в IMemoryCache, поэтому сервис
// может быть scoped — состояния он не держит.
builder.Services.AddScoped<ICatalogSnapshotService, CatalogSnapshotService>();
builder.Services.AddScoped<IGameGenreDirectory, GameGenreDirectory>();
builder.Services.AddScoped<ISoftwareCategoryDirectory, SoftwareCategoryDirectory>();
builder.Services.AddScoped<SuperBot.WebApi.Services.Storefront.IDealSpotlightService, SuperBot.WebApi.Services.Storefront.DealSpotlightService>();
builder.Services.AddScoped<IRecommendationsService, RecommendationsService>();
builder.Services.AddScoped<IBlogRecommendationsService, BlogRecommendationsService>();
builder.Services.AddScoped<IPromoCodeService, PromoCodeService>();
builder.Services.AddScoped<ISteamOrderRepository, SteamOrderMongoDbRepository>();
builder.Services.AddScoped<ISettingsRepository, SettingsMongoDbRepository>();
builder.Services.AddScoped<ICartRepository, CartMongoDbRepository>();
builder.Services.AddScoped<IBillingProfileRepository, BillingProfileMongoDbRepository>();
builder.Services.AddScoped<ICoverImageMetaRepository, SuperBot.Infrastructure.Repositories.CoverImageMetaMongoDbRepository>();
builder.Services.AddScoped<SuperBot.WebApi.Services.ICoverImages, SuperBot.WebApi.Services.CoverImages>();
builder.Services.AddScoped<IPromoCodeRepository, PromoCodeMongoDbRepository>();
builder.Services.AddScoped<IPromoCodeUsageRepository, PromoCodeUsageMongoDbRepository>();
builder.Services.AddScoped<IImportJobRepository, ImportJobMongoDbRepository>();
builder.Services.AddScoped<ISupportTicketService, SupportTicketService>();
// Восстановление доступа (сброс 2FA через поддержку): заявки, письма, админский workflow.
builder.Services.Configure<SuperBot.WebApi.Recovery.RecoveryOptions>(builder.Configuration.GetSection("Recovery"));
builder.Services.AddScoped<SuperBot.WebApi.Recovery.Services.RecoveryMailService>();
builder.Services.AddScoped<SuperBot.WebApi.Recovery.Services.IRecoveryRequestService, SuperBot.WebApi.Recovery.Services.RecoveryRequestService>();
// Модель за чатом поддержки. Оба клиента регистрируются всегда: DeepSeek — основной провайдер
// по настройке SupportChat:Provider, Ollama — резерв, на который роутер уходит при сбое,
// отсутствующей конфигурации или исчерпанном дневном бюджете.
// Предел ожидания ответа модели задаётся настройкой SupportChat:LlmTimeoutSeconds. У HttpClient
// свой предел по умолчанию — сто секунд, и раньше именно он и срабатывал, переживая настройку.
// Даём соединению немного сверх логического предела, чтобы отменял именно код, а не транспорт.
var llmHttpTimeout = TimeSpan.FromSeconds(
    (builder.Configuration.GetValue<int?>("SupportChat:LlmTimeoutSeconds") ?? 45) + 5);
builder.Services.AddHttpClient<SuperBot.WebApi.Support.Chat.Services.OllamaChatClient>(
    client => client.Timeout = llmHttpTimeout);
builder.Services.AddHttpClient<SuperBot.WebApi.Support.Chat.Services.DeepSeekChatClient>(
    client => client.Timeout = llmHttpTimeout);
builder.Services.AddSingleton<SuperBot.WebApi.Support.Chat.Services.LlmProviderHealth>();
builder.Services.AddSingleton<SuperBot.WebApi.Support.Chat.Services.ILlmSpendTracker, SuperBot.WebApi.Support.Chat.Services.LlmSpendTracker>();
builder.Services.AddScoped<SuperBot.WebApi.Support.Chat.Services.ISupportLlmClient, SuperBot.WebApi.Support.Chat.Services.SupportLlmRouter>();
// База знаний и готовые ответы живут в Mongo и правятся из админки, поэтому Scoped:
// подключение к базе тоже Scoped. От частых чтений спасает кэш внутри хранилища.
builder.Services.AddScoped<SuperBot.WebApi.Support.Chat.Services.ISupportKnowledgeStore, SuperBot.WebApi.Support.Chat.Services.SupportKnowledgeStore>();
builder.Services.AddScoped<SuperBot.WebApi.Support.Chat.Services.ISupportKnowledgeBase, SuperBot.WebApi.Support.Chat.Services.SupportKnowledgeBase>();
builder.Services.AddScoped<SuperBot.WebApi.Support.Chat.Services.ISupportInstantAnswers, SuperBot.WebApi.Support.Chat.Services.SupportInstantAnswers>();
builder.Services.AddSingleton<SuperBot.WebApi.Support.Chat.Services.ISupportAvailability, SuperBot.WebApi.Support.Chat.Services.SupportAvailability>();
builder.Services.AddSingleton<SuperBot.WebApi.Support.Chat.Services.ILlmConcurrencyLimiter, SuperBot.WebApi.Support.Chat.Services.LlmConcurrencyLimiter>();
// Очередь ходов в пределах одной сессии — состояние общее для всех запросов, поэтому Singleton.
builder.Services.AddSingleton<SuperBot.WebApi.Support.Chat.Services.ISupportSessionGate, SuperBot.WebApi.Support.Chat.Services.SupportSessionGate>();
builder.Services.AddHttpClient<SuperBot.WebApi.Support.Chat.Services.ITurnstileVerifier, SuperBot.WebApi.Support.Chat.Services.TurnstileVerifier>();
builder.Services.AddScoped<SuperBot.WebApi.Support.Chat.Services.ISupportNotificationService, SuperBot.WebApi.Support.Chat.Services.SupportNotificationService>();
builder.Services.AddScoped<SuperBot.WebApi.Support.Chat.Services.ISupportChatService, SuperBot.WebApi.Support.Chat.Services.SupportChatService>();

// Почта и рассылка. MailOptions — общий SMTP-конфиг; при пустой секции "Mail"
// значения наследуются из Recovery, поэтому существующие env работают как раньше.
builder.Services.AddOptions<SuperBot.WebApi.Mail.MailOptions>()
    .Bind(builder.Configuration.GetSection("Mail"))
    .PostConfigure<Microsoft.Extensions.Options.IOptions<SuperBot.WebApi.Recovery.RecoveryOptions>>((mail, recovery) =>
    {
        if (string.IsNullOrWhiteSpace(mail.SmtpHost)) mail.SmtpHost = recovery.Value.SmtpHost;
        if (mail.SmtpPort == 0) mail.SmtpPort = recovery.Value.SmtpPort;
        if (string.IsNullOrWhiteSpace(mail.FromAddress)) mail.FromAddress = recovery.Value.FromAddress;
        if (string.IsNullOrWhiteSpace(mail.FromName)) mail.FromName = recovery.Value.FromName;
        if (string.IsNullOrWhiteSpace(mail.PublicBaseUrl)) mail.PublicBaseUrl = recovery.Value.PublicBaseUrl;
    });
builder.Services.AddScoped<SuperBot.WebApi.Mail.IMailSender, SuperBot.WebApi.Mail.SmtpMailSender>();
builder.Services.AddScoped<SuperBot.WebApi.Newsletter.INewsletterService, SuperBot.WebApi.Newsletter.NewsletterService>();
builder.Services.AddScoped<SuperBot.WebApi.Newsletter.INewsletterDispatcher, SuperBot.WebApi.Newsletter.NewsletterDispatcher>();
builder.Services.AddHostedService<SuperBot.WebApi.Newsletter.NewsletterSendWorker>();



builder.Services.AddAutoMapper(typeof(GameProfile));
builder.Services.AddAutoMapper(typeof(GameDiscountProfile));
builder.Services.AddAutoMapper(typeof(GameDetailsProfile));
builder.Services.AddAutoMapper(typeof(CartGameProfile));
builder.Services.AddAutoMapper(typeof(MediaAssetProfile));
builder.Services.AddAutoMapper(typeof(BlogProfile));
builder.Services.AddAutoMapper(typeof(AnalyticsSettingsProfile));
builder.Services.AddAutoMapper(typeof(ImportJobProfile));
builder.Services.AddAutoMapper(typeof(PromoCodeProfile));

builder.Services.AddHttpClient();
builder.Services.AddScoped<Ga4Client>();
builder.Services.AddHostedService<SuperBot.WebApi.Support.Chat.Services.SupportLlmStartupLogger>();

// Первый запуск: справочник жанров и категорий создаётся, если настроек ещё нет.
using (var scope = builder.Services.BuildServiceProvider().CreateScope())
{
    var repository = scope.ServiceProvider.GetRequiredService<ISettingsRepository>();
    var settings = await repository.GetAllAsync();
    if (settings.Count() == 0)
    {

        var newSettings = new Settings
        {
            Id = Guid.NewGuid(),
            GameCategories = GameGenres.Defaults
                .Select(genre => new GameCategory { Tag = genre.Tag, Title = genre.Title })
                .ToArray(),
            SoftwareCategories = SoftwareCatalog.DefaultCategories
                .Select(category => new GameCategory { Tag = category.Tag, Title = category.Title })
                .ToArray(),
        };
        await repository.CreateAsync(newSettings);
    }
}

//  Hangfire   MongoDB
// Hangfire:Enabled=false — для интеграционных тестов: серверу планировщика и его
// Mongo-миграциям в тестовом хосте делать нечего.
var hangfireEnabled = builder.Configuration.GetValue("Hangfire:Enabled", true);
if (hangfireEnabled)
{
    builder.Services.AddHangfire(config =>
    {
        var connectionString = builder.Configuration.GetSection("ConnectionStrings:MongoDb").Value;
        var mongoName = builder.Configuration.GetSection("ConnectionStrings:Name").Value;

        var mongoUrlBuilder = new MongoUrlBuilder(connectionString);
        config.UseMongoStorage(mongoUrlBuilder.ToMongoUrl().Url, mongoName, new MongoStorageOptions
        {
            MigrationOptions = new MongoMigrationOptions
            {
                MigrationStrategy = new DropMongoMigrationStrategy(),
                //MigrationStrategy = new MigrateMongoMigrationStrategy(),
                BackupStrategy = new CollectionMongoBackupStrategy()
            }
        });
    });

    //  Dashboard   Hangfire
    builder.Services.AddHangfireServer();
}


builder.Services.AddHttpClient<IKeycloakClient, KeycloakClient>((httpClient) =>
{
    // Admin REST API Keycloak зовём по внутреннему адресу (в docker это http://keycloak:8080).
    // Keycloak:Uri — публичный issuer для браузера, изнутри контейнера он недоступен.
    var uri = builder.Configuration["Keycloak:Admin:BaseUrl"]
        ?? builder.Configuration["Keycloak:Uri"];
    httpClient.BaseAddress = new Uri(uri);
    return new KeycloakClient(httpClient, uri);
});

// Клиент админ-API Keycloak (нужен AccountSecurityController: статус, сессии, 2FA, смена email/пароля).
// Конфиг — в секции Keycloak:Admin (см. docker-compose env). Без этой регистрации контроллер падал в 500.
builder.Services.AddHttpClient<KeycloakAdminClient>();
// Повторная проверка пароля (показ ключей в кабинете) — через Keycloak; в тестах подменяется.
builder.Services.AddScoped<SuperBot.WebApi.Services.IPasswordVerifier, SuperBot.WebApi.Services.KeycloakPasswordVerifier>();

builder.Services.AddScoped<IBackgroundTaskService, BackgroundTaskService>();

builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddTransient<IClaimsTransformation, KeycloakClaimsTransformation>();
builder.Services.AddAuthorization(options =>
{
    var supportRoles = builder.Configuration.GetSection("Support:Roles").Get<SupportRoleOptions>()?.Roles
        ?? new List<string> { "admin", "support" };
    options.AddPolicy("SupportAgent", policy => policy.RequireRole(supportRoles.ToArray()));
});

// Лимиты частоты для анонимных форм (см. PublicRateLimits): перебор промокодов.
builder.Services.AddPublicRateLimits(builder.Configuration);

builder.Services.AddLogging(logging =>
{
    logging.AddConsole();
    logging.AddDebug();
});
builder.Logging.AddProvider(new SuperBot.WebApi.Services.SupportChatConsoleLoggerProvider());

var app = builder.Build();
var startupLogger = app.Logger;

app.Lifetime.ApplicationStarted.Register(() =>
{
    var supportChatSection = app.Configuration.GetSection("SupportChat");
    var provider = supportChatSection.GetValue<string>("Provider") ?? "ollama";
    var streamingEnabled = supportChatSection.GetValue<bool>("StreamingEnabled");

    startupLogger.LogInformation("SuperBot.WebApi started. Environment: {Environment}", app.Environment.EnvironmentName);
    // Подробности по провайдеру и резерву пишет SupportLlmStartupLogger.
    startupLogger.LogInformation("Support chat AI: provider={Provider}, streaming={StreamingEnabled}",
        provider, streamingEnabled);
    startupLogger.LogInformation("CORS allowed origin: {Origin}",
        app.Configuration.GetSection("FrontendConfiguration:Uri").Value ?? "not configured");

    // Сюда доходим только с заполненными настройками — иначе приложение не запустилось бы.
    startupLogger.LogInformation("Keycloak admin client configured: client {ClientId} at {BaseUrl}.",
        app.Configuration["Keycloak:Admin:ClientId"], app.Configuration["Keycloak:Admin:BaseUrl"]);
});

app.UseExceptionHandler(exceptionApp =>
{
    exceptionApp.Run(async context =>
    {
        var logger = context.RequestServices
            .GetRequiredService<ILoggerFactory>()
            .CreateLogger("GlobalExceptionHandler");

        var exceptionFeature = context.Features.Get<IExceptionHandlerPathFeature>();

        // Недоступный платёжный провайдер — не поломка сервиса, а внешняя связь, и лечится
        // не кодом. Пишем одну строку вместо стека: иначе каждое открытие кабинета печатает
        // две простыни, и в них тонет то, что действительно требует внимания.
        var paymentProviderDown = exceptionFeature?.Error != null
            && SuperBot.WebApi.Services.PaymentProviderOutage.IsPaymentPath(context.Request.Path)
            && SuperBot.WebApi.Services.PaymentProviderOutage.IsUnreachable(exceptionFeature.Error);

        if (paymentProviderDown)
        {
            logger.LogWarning(
                "Payment provider unreachable for {Method} {Path}: {Reason}. TraceId: {TraceId}",
                context.Request.Method,
                context.Request.Path,
                SuperBot.WebApi.Services.PaymentProviderOutage.DescribeReason(exceptionFeature!.Error),
                context.TraceIdentifier);

            // 503, а не 500: сервер жив, недоступен внешний сервис. По этому статусу фронт
            // показывает «попробовать ещё раз», а не общий экран ошибки.
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new
            {
                message = "The payment provider is unreachable from the server right now. "
                          + "Card details and billing history are temporarily unavailable; nothing was charged.",
                traceId = context.TraceIdentifier,
                code = "PAYMENT_PROVIDER_UNAVAILABLE"
            });
            return;
        }

        if (exceptionFeature?.Error != null)
        {
            logger.LogError(exceptionFeature.Error,
                "Unhandled exception for {Method} {Path}. TraceId: {TraceId}",
                context.Request.Method,
                context.Request.Path,
                context.TraceIdentifier);
        }

        // Ненастроенный служебный клиент Keycloak — не сбой сервиса, а незаполненная настройка.
        // 503 с прямым текстом вместо общего «что-то пошло не так»: по нему сразу видно, что
        // чинить, и фронт может показать это человеку, а не крутить загрузку.
        if (exceptionFeature?.Error is SuperBot.WebApi.Services.KeycloakAdminNotConfiguredException notConfigured)
        {
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new
            {
                message = "Account security is not configured on the server. Missing: "
                          + string.Join(", ", notConfigured.Missing) + ".",
                traceId = context.TraceIdentifier,
                code = "KEYCLOAK_ADMIN_NOT_CONFIGURED"
            });
            return;
        }

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json";

        var isConfirmPaymentPath = context.Request.Path.StartsWithSegments("/api/payments/confirm-payment-intent");
        var response = isConfirmPaymentPath
            ? new
            {
                message = "We couldn't finalize your order. Please try again or contact support.",
                traceId = context.TraceIdentifier,
                code = "ORDER_CREATE_FAILED"
            }
            : new
            {
                message = "Something went wrong. Please try again.",
                traceId = context.TraceIdentifier,
                code = "INTERNAL_ERROR"
            };

        await context.Response.WriteAsJsonAsync(response);
    });
});

if (app.Environment.IsDevelopment() && app.Configuration.GetSection("Diagnostics").GetValue<bool>("LogHttpRequests"))
{
    app.Use(async (context, next) =>
    {
        var requestLogger = context.RequestServices.GetRequiredService<ILoggerFactory>()
            .CreateLogger("HttpRequestLogger");
        requestLogger.LogInformation("HTTP {Method} {Path} started.", context.Request.Method, context.Request.Path);
        await next();
        requestLogger.LogInformation("HTTP {Method} {Path} finished with {StatusCode}.",
            context.Request.Method,
            context.Request.Path,
            context.Response.StatusCode);
    });
}

app.UseForwardedHeaders();

StripeConfiguration.ApiKey = builder.Configuration["Stripe:SecretKey"];

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    if (hangfireEnabled)
    {
        app.UseHangfireDashboard();
    }
}

//    DI-   
using (var scope = app.Services.CreateScope())
{
    startupLogger.LogInformation("Initializing MongoDB collections and indexes...");
    var mongoDbInitializer = scope.ServiceProvider.GetRequiredService<MongoDbInitializer>();
    await mongoDbInitializer.InitializeAsync(); //
    startupLogger.LogInformation("MongoDB initialization completed.");

    // Курсы валют при старте: суточная задача Hangfire срабатывает в полночь UTC, и после
    // рестарта магазин мог бы до полуночи торговать по курсу из конфига. Тянем сразу, если
    // источник задан и книга пуста или протухла (старше суток). В фоне: сеть до внешнего
    // сервиса не должна задерживать старт, а при отказе остаётся прежний курс — гард в книге.
    _ = Task.Run(async () =>
    {
        try
        {
            using var fxScope = app.Services.CreateScope();
            var fxOptions = fxScope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptionsMonitor<SuperBot.Core.Payments.FxOptions>>().CurrentValue;
            if (string.IsNullOrWhiteSpace(fxOptions.Source?.Url))
            {
                return;
            }
            // Смотрим в базу, а не в книгу: курсы из ManualRates попадают в книгу с временем старта
            // и всегда выглядят свежими, хотя это стартовая заглушка, а не снимок источника.
            var currencies = fxScope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<SuperBot.Core.Payments.StorefrontCurrencyOptions>>().Value;
            var stored = await fxScope.ServiceProvider.GetRequiredService<IFxRateRepository>().GetLatestAsync(currencies.Base);
            var stale = stored.Count == 0 || stored.Min(r => r.CapturedAtUtc) < DateTime.UtcNow.AddHours(-24);
            if (!stale)
            {
                return;
            }
            app.Logger.LogInformation("Курсы валют: снимка в базе нет или он старше суток — запускаем импорт при старте.");
            await fxScope.ServiceProvider.GetRequiredService<SuperBot.Infrastructure.Services.IFxRateImportService>().RunAsync();
        }
        catch (Exception ex)
        {
            app.Logger.LogWarning(ex, "Курсы валют: стартовый импорт не удался — работаем по прежним курсам до следующего запуска задачи.");
        }
    });

    // Первый запуск после обновления: темы поддержки переезжают из кода в базу.
    var knowledgeStore = scope.ServiceProvider.GetRequiredService<SuperBot.WebApi.Support.Chat.Services.ISupportKnowledgeStore>();
    await knowledgeStore.SeedIfEmptyAsync();
}

//  
var supportedCultures = new[] { "en-US", "ru-RU" };
var localizationOptions = new RequestLocalizationOptions()
    .SetDefaultCulture("ru-RU")
    .AddSupportedCultures(supportedCultures)
    .AddSupportedUICultures(supportedCultures);

app.UseRequestLocalization(localizationOptions);

app.UseHttpsRedirection();

app.UseCors("AllowSpecificOrigin");

// Заголовки кэша для /uploads. Общие для обоих провайдеров статики: wwwroot целиком (uploads лежит внутри него и
// отдаётся им первым) и отдельный провайдер папки загрузок (когда она вынесена настройкой Uploads:Root).
// Варианты обложек (/uploads/v/…) — сутки: после смены точки фокуса та же ссылка должна показать новую обрезку.
// Файлы с именем-GUID никогда не меняются — год. Остальное (демо, аватары) — сутки.
Action<Microsoft.AspNetCore.StaticFiles.StaticFileResponseContext> uploadsCacheHeaders = ctx =>
{
    var path = ctx.Context.Request.Path.Value ?? string.Empty;
    if (!path.StartsWith("/uploads/", StringComparison.OrdinalIgnoreCase))
    {
        return;
    }
    var name = Path.GetFileNameWithoutExtension(path);
    var immutable = !path.StartsWith("/uploads/v/", StringComparison.OrdinalIgnoreCase)
        && name.Length == 32 && name.All(Uri.IsHexDigit);
    ctx.Context.Response.Headers["Cache-Control"] = immutable
        ? "public, max-age=31536000, immutable"
        : "public, max-age=86400";
};

app.UseStaticFiles(new StaticFileOptions { OnPrepareResponse = uploadsCacheHeaders });

// Та же папка, что у загрузки и вариантов обложек (CoverImages.Root): иначе файл кладётся в одно место, а
// отдаётся из другого.
var uploadsPath = SuperBot.WebApi.Services.CoverImages.ResolveRoot(builder.Configuration, app.Environment);

if (!Directory.Exists(uploadsPath))
{
    Directory.CreateDirectory(uploadsPath);
}

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadsPath),
    RequestPath = "/uploads",
    OnPrepareResponse = uploadsCacheHeaders
});

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapControllers();

if (hangfireEnabled)
{
    using var scope = app.Services.CreateScope();
    var recurringJobManager = scope.ServiceProvider.GetRequiredService<IRecurringJobManager>();
    //
    recurringJobManager.AddOrUpdate(
        "clear-old-order-records",
        () => scope.ServiceProvider.GetRequiredService<IBackgroundTaskService>().ScheduleClearOutdatedDataJob(),
        Cron.Daily);

    // Гостевые заказы, не подтвердившие почту за 48ч, автоматически возвращаются.
    // Типизированная регистрация: Hangfire резолвит сервис из DI на каждый запуск (свой scope).
    recurringJobManager.AddOrUpdate<IUnverifiedOrderRefundService>(
        "auto-refund-unverified-orders",
        service => service.RunAsync(),
        Cron.Hourly);

    // «Карта удачи» создаёт по одноразовому промокоду на каждый розыгрыш — без уборки
    // они копятся в админ-списке промокодов навсегда.
    // Курсы валют: раз в сутки. Гард на скачок и запись в историю живут в самой книге курсов,
    // поэтому задача только приносит числа.
    recurringJobManager.AddOrUpdate<SuperBot.Infrastructure.Services.IFxRateImportService>(
        "import-fx-rates",
        service => service.RunAsync(),
        Cron.Daily);

    // Здоровье зависимостей: каждые пять минут. Чаще незачем — все наши аварии длились
    // часами и днями; реже — и «сломалось» перестаёт быть новостью.
    recurringJobManager.AddOrUpdate<SuperBot.WebApi.Services.Health.ServiceHealthMonitor>(
        "service-health",
        monitor => monitor.RunAsync(CancellationToken.None),
        "*/5 * * * *");

    // Кэшбэк: приводит журнал в соответствие с заказами (пропущенные начисления, возвраты,
    // ручная смена статуса). Выключенная программа — задача сразу выходит.
    recurringJobManager.AddOrUpdate<SuperBot.Infrastructure.Services.ICashbackSyncService>(
        "cashback-sync",
        service => service.RunAsync(),
        Cron.Hourly);

    // Письма о кэшбэке. Раз в сутки: разблокировка и сгорание привязаны к дню, чаще писать незачем.
    recurringJobManager.AddOrUpdate<SuperBot.WebApi.Services.Cashback.CashbackNoticeService>(
        "cashback-notices",
        service => service.RunAsync(CancellationToken.None),
        Cron.Daily(10));

    // Налог: дописывает транзакции Stripe Tax, не записанные при оплате, и сторно возвратов.
    recurringJobManager.AddOrUpdate<SuperBot.Infrastructure.Services.ITaxSyncService>(
        "tax-sync",
        service => service.RunAsync(),
        Cron.Hourly);

    recurringJobManager.AddOrUpdate<ITarotMaintenanceService>(
        "purge-expired-tarot-codes",
        service => service.PurgeExpiredCodesAsync(),
        Cron.Daily);

    // Приглашения оставить отзыв. Раз в сутки: письмо привязано к дню, а не к часу, и
    // сама задача проверяет, что с выдачи прошла неделя. Отправлять чаще незачем.
    recurringJobManager.AddOrUpdate<SuperBot.WebApi.Services.ReviewInvites.ReviewInviteService>(
        "review-invites",
        service => service.RunAsync(CancellationToken.None),
        Cron.Daily);
}

app.Run();

// Точка входа для WebApplicationFactory<Program> в интеграционных тестах (SuperBot.WebApi.Tests).
public partial class Program { }
