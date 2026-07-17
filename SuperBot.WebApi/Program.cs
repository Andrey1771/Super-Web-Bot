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
using SuperBot.WebApi.Services;
using Microsoft.Extensions.FileProviders;
using SuperBot.Core.Entities;
using SuperBot.Common.Auth;
using Microsoft.AspNetCore.Authentication;
using Stripe;
using Microsoft.AspNetCore.HttpOverrides;
using SuperBot.Application.Commands.Telegram;
using Telegram.Bot;
using SuperBot.WebApi.Types;
using SuperBot.Core.Interfaces.IBotStateService;
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

var domainAssembly = typeof(GetMainMenuCommand).Assembly;
builder.Services
    .AddMediatR(cfg => cfg.RegisterServicesFromAssembly(domainAssembly));

// Setup bot configuration
var botConfigSection = builder.Configuration.GetSection("BotConfiguration");
builder.Services.Configure<BotConfiguration>(botConfigSection);
builder.Services.AddHttpClient("tgwebhook").RemoveAllLoggers().AddTypedClient<ITelegramBotClient>(
    httpClient => new TelegramBotClient(botConfigSection.Get<BotConfiguration>()!.BotToken, httpClient));

builder.Services.AddTransient<IResourceService, JsonResourceService>();
builder.Services.AddSingleton<IUrlService, UrlProvider>();

builder.Services.AddTransient<ITranslationsService, TranslationsService>();
builder.Services.AddTransient<IAdminSettingsProvider, AdminSettingsProvider>();

builder.Services.AddSingleton<BotStateService>();
builder.Services.AddSingleton<IBotStateReaderService>(provider => provider.GetRequiredService<BotStateService>());
builder.Services.AddSingleton<IBotStateWriterService>(provider => provider.GetRequiredService<BotStateService>());

builder.Services.AddTransient<IPayService, YooKassaService>();

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
builder.Services.AddScoped<IBlogEventRepository, BlogEventMongoDbRepository>();
builder.Services.AddScoped<IBlogPostUniqueViewRepository, BlogPostUniqueViewMongoDbRepository>();
builder.Services.AddScoped<IBlogViewSettingsRepository, BlogViewSettingsMongoDbRepository>();
builder.Services.AddScoped<IUserBlogProfileRepository, UserBlogProfileMongoDbRepository>();
builder.Services.AddScoped<IAnalyticsSettingsRepository, AnalyticsSettingsMongoDbRepository>();
builder.Services.AddScoped<IUserRepository, UserMongoDbRepository>();
builder.Services.AddScoped<IWishlistRepository, WishlistMongoDbRepository>();
builder.Services.AddScoped<IViewedGameRepository, ViewedGameMongoDbRepository>();
builder.Services.AddScoped<IGameKeyRepository, GameKeyMongoDbRepository>();
// Выдача ключей: из пула инвентаря. См. KeyFulfillmentService.
builder.Services.AddScoped<IKeyFulfillmentService, KeyFulfillmentService>();
builder.Services.AddScoped<IGameReviewRepository, GameReviewMongoDbRepository>();
builder.Services.AddScoped<IGameReviewHelpfulRepository, GameReviewHelpfulMongoDbRepository>();
builder.Services.AddScoped<IGameQuestionRepository, GameQuestionMongoDbRepository>();
builder.Services.AddScoped<IGameTrackingRepository, GameTrackingMongoDbRepository>();
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
builder.Services.AddHttpClient<SuperBot.WebApi.Support.Chat.Services.IOllamaChatClient, SuperBot.WebApi.Support.Chat.Services.OllamaChatClient>();
builder.Services.AddSingleton<SuperBot.WebApi.Support.Chat.Services.ISupportKnowledgeBase, SuperBot.WebApi.Support.Chat.Services.SupportKnowledgeBase>();
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
builder.Services.AddHostedService<SuperBot.WebApi.Support.Chat.Services.OllamaStartupLogger>();

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
    var uri = builder.Configuration["Keycloak:Uri"];
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
    var ollamaBaseUrl = supportChatSection.GetValue<string>("OllamaBaseUrl") ?? "n/a";
    var ollamaModel = supportChatSection.GetValue<string>("OllamaModel") ?? "n/a";
    var streamingEnabled = supportChatSection.GetValue<bool>("StreamingEnabled");

    startupLogger.LogInformation("SuperBot.WebApi started. Environment: {Environment}", app.Environment.EnvironmentName);
    startupLogger.LogInformation("Support chat AI: {OllamaBaseUrl} (model={OllamaModel}, streaming={StreamingEnabled})",
        ollamaBaseUrl, ollamaModel, streamingEnabled);
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
}

app.Run();

// Точка входа для WebApplicationFactory<Program> в интеграционных тестах (SuperBot.WebApi.Tests).
public partial class Program { }
