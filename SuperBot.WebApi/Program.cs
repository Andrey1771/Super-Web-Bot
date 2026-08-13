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

var builder = WebApplication.CreateBuilder(args);

try
{
    BsonSerializer.RegisterSerializer(new GuidSerializer(GuidRepresentation.Standard));
}
catch (BsonSerializationException)
{
    // Serializer may already be registered by test host / warm reload.
}

// !!!     
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
});
// !!!     

// Add services to the container.
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.CustomSchemaIds(type => type.FullName); //    
});

builder.Services.AddMemoryCache();


//  CORS   
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

            builder.WithOrigins(allowedOrigins.Distinct().ToArray()) // TODO!!!!!!
                   .AllowAnyHeader()
                   .AllowAnyMethod()
                   .AllowCredentials(); //   / 
        });
});

builder.Services.Configure<StripeSettings>(builder.Configuration.GetSection("Stripe"));

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
    return mongoClient.GetDatabase(mongoName);  //     
});
builder.Services.AddScoped<MongoDbInitializer>();

builder.Services.AddScoped<IGameRepository, GameMongoDbRepository>();
builder.Services.AddScoped<IGameDiscountRepository, GameDiscountMongoDbRepository>();
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
// Дедупликация вебхуков: Stripe доставляет события «хотя бы один раз».
builder.Services.AddScoped<IStripeEventLog, StripeEventLog>();
// Шов к Stripe: единственное место обращения к их SDK. В тестах подменяется фейком.
builder.Services.AddScoped<IStripePaymentIntentGateway, StripePaymentIntentGateway>();
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
builder.Services.AddScoped<IGameQuestionRepository, GameQuestionMongoDbRepository>();
builder.Services.AddScoped<IGameTrackingRepository, GameTrackingMongoDbRepository>();
// Собранный каталог для витрины. Сам объект кэшируется в IMemoryCache, поэтому сервис
// может быть scoped — состояния он не держит.
builder.Services.AddScoped<ICatalogSnapshotService, CatalogSnapshotService>();
builder.Services.AddScoped<IRecommendationsService, RecommendationsService>();
builder.Services.AddScoped<IBlogRecommendationsService, BlogRecommendationsService>();
builder.Services.AddScoped<IPromoCodeService, PromoCodeService>();
builder.Services.AddScoped<ISteamOrderRepository, SteamOrderMongoDbRepository>();
builder.Services.AddScoped<ISettingsRepository, SettingsMongoDbRepository>();
builder.Services.AddScoped<ICartRepository, CartMongoDbRepository>();
builder.Services.AddScoped<IBillingProfileRepository, BillingProfileMongoDbRepository>();
builder.Services.AddScoped<IPromoCodeRepository, PromoCodeMongoDbRepository>();
builder.Services.AddScoped<IPromoCodeUsageRepository, PromoCodeUsageMongoDbRepository>();
builder.Services.AddScoped<IImportJobRepository, ImportJobMongoDbRepository>();
builder.Services.AddScoped<ISupportTicketService, SupportTicketService>();
builder.Services.AddScoped<SupportRoleEvaluator>();
// Восстановление доступа (сброс 2FA через поддержку): заявки, письма, админский workflow.
builder.Services.Configure<SuperBot.WebApi.Recovery.RecoveryOptions>(builder.Configuration.GetSection("Recovery"));
builder.Services.AddScoped<SuperBot.WebApi.Recovery.Services.RecoveryMailService>();
builder.Services.AddScoped<SuperBot.WebApi.Recovery.Services.IRecoveryRequestService, SuperBot.WebApi.Recovery.Services.RecoveryRequestService>();
// Модель за чатом поддержки. Оба клиента регистрируются всегда: DeepSeek — основной провайдер
// по настройке SupportChat:Provider, Ollama — резерв, на который роутер уходит при сбое,
// отсутствующей конфигурации или исчерпанном дневном бюджете.
builder.Services.AddHttpClient<SuperBot.WebApi.Support.Chat.Services.OllamaChatClient>();
builder.Services.AddHttpClient<SuperBot.WebApi.Support.Chat.Services.DeepSeekChatClient>();
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
builder.Services.AddScoped<YandexMetrikaClient>();
builder.Services.AddHostedService<SuperBot.WebApi.Support.Chat.Services.SupportLlmStartupLogger>();

//TODO     ,     ,   
using (var scope = builder.Services.BuildServiceProvider().CreateScope())
{
    var repository = scope.ServiceProvider.GetRequiredService<ISettingsRepository>();
    var settings = await repository.GetAllAsync();
    if (settings.Count() == 0)
    {
        var gameCategories = Enum.GetNames(typeof(GameType)).ToList();

        var newSettings = new Settings
        {
            Id = Guid.NewGuid(),
            GameCategories = gameCategories.Select((category, index) =>
            {
                var description = "";
                GameTypeMapper.DescriptionsCategories.TryGetValue((GameType)index, out description);
                return new GameCategory
                {
                    Tag = category,
                    Title = description
                };
            }).ToArray(),
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

builder.Services.AddScoped<IBackgroundTaskService, BackgroundTaskService>();

builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddTransient<IClaimsTransformation, KeycloakClaimsTransformation>();
builder.Services.AddAuthorization(options =>
{
    var supportRoles = builder.Configuration.GetSection("Support:Roles").Get<SupportRoleOptions>()?.Roles
        ?? new List<string> { "admin", "support" };
    options.AddPolicy("SupportAgent", policy => policy.RequireRole(supportRoles.ToArray()));
});

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
});

app.UseExceptionHandler(exceptionApp =>
{
    exceptionApp.Run(async context =>
    {
        var logger = context.RequestServices
            .GetRequiredService<ILoggerFactory>()
            .CreateLogger("GlobalExceptionHandler");

        var exceptionFeature = context.Features.Get<IExceptionHandlerPathFeature>();
        if (exceptionFeature?.Error != null)
        {
            logger.LogError(exceptionFeature.Error,
                "Unhandled exception for {Method} {Path}. TraceId: {TraceId}",
                context.Request.Method,
                context.Request.Path,
                context.TraceIdentifier);
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

// !!!     HTTP-     
app.UseForwardedHeaders();
// !!!     HTTP-     

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

app.UseStaticFiles();

var uploadsPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot/uploads");

if (!Directory.Exists(uploadsPath))
{
    Directory.CreateDirectory(uploadsPath);
}

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadsPath),
    RequestPath = "/uploads"
});

app.UseAuthentication();
app.UseAuthorization();
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
    recurringJobManager.AddOrUpdate<ITarotMaintenanceService>(
        "purge-expired-tarot-codes",
        service => service.PurgeExpiredCodesAsync(),
        Cron.Daily);
}

app.Run();

// Точка входа для WebApplicationFactory<Program> в интеграционных тестах (SuperBot.WebApi.Tests).
public partial class Program { }
