using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.HttpOverrides;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using SuperBot.Application.Commands.Telegram;
using SuperBot.BotApi.Services;
using SuperBot.BotApi.Types;
using SuperBot.Common.Auth;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IBotStateService;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;
using SuperBot.Infrastructure.Models;
using SuperBot.Infrastructure.Repositories;
using SuperBot.Infrastructure.Services;
using Telegram.Bot;

var builder = WebApplication.CreateBuilder(args);

try
{
    BsonSerializer.RegisterSerializer(new GuidSerializer(GuidRepresentation.Standard));
}
catch (BsonSerializationException)
{
    // Уже зарегистрирован (тест-хост/warm reload).
}

// За nginx: доверяем forwarded-заголовкам.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
});

builder.Services.AddControllers();
builder.Services.AddMemoryCache();

// --- Mongo ---
builder.Services.AddSingleton<IMongoClient, MongoClient>(_ =>
    new MongoClient(builder.Configuration.GetSection("ConnectionStrings:MongoDb").Value));
builder.Services.AddScoped<IMongoDatabase>(sp =>
    sp.GetRequiredService<IMongoClient>().GetDatabase(builder.Configuration.GetSection("ConnectionStrings:Name").Value));

builder.Services.AddAutoMapper(typeof(GameProfile)); // сканирует все профили в Infrastructure.Models

// --- Репозитории, нужные боту ---
builder.Services.AddScoped<IGameRepository, GameMongoDbRepository>();
// Курсы валют: цена в звёздах считается от долларов, поэтому сумму в другой валюте
// сперва надо привести к ним. Настройки те же, что у сайта — секция Storefront.
builder.Services.Configure<SuperBot.Core.Payments.StorefrontCurrencyOptions>(builder.Configuration.GetSection("Storefront"));
builder.Services.Configure<SuperBot.Core.Payments.FxOptions>(builder.Configuration.GetSection("Storefront:Fx"));
builder.Services.AddScoped<SuperBot.Core.Interfaces.IRepositories.IFxRateRepository, SuperBot.Infrastructure.Repositories.FxRateMongoDbRepository>();
builder.Services.AddSingleton<SuperBot.Infrastructure.Services.IFxRateService, SuperBot.Infrastructure.Services.FxRateService>();
builder.Services.AddScoped<IGameDiscountRepository, GameDiscountMongoDbRepository>();
builder.Services.AddScoped<IOrderRepository, OrderMongoDbRepository>();
builder.Services.AddScoped<IUserRepository, UserMongoDbRepository>();
builder.Services.AddScoped<IWishlistRepository, WishlistMongoDbRepository>();
builder.Services.AddScoped<IGameKeyRepository, GameKeyMongoDbRepository>();
builder.Services.AddScoped<ITelegramLinkRepository, TelegramLinkMongoDbRepository>();

// --- Бот-логика и Telegram ---
var botConfigSection = builder.Configuration.GetSection("BotConfiguration");
builder.Services.Configure<BotConfiguration>(botConfigSection);
// Токен проверяется здесь, один раз и до старта. Раньше конструктор TelegramBotClient падал
// внутри DI при первом запросе — сервис поднимался «здоровым» и валился только когда кто-то
// открывал раздел Bot в админке, причём 500-й ошибкой без текста причины.
var botToken = botConfigSection.Get<BotConfiguration>()?.BotToken;
var botTokenUsable = SuperBot.BotApi.Services.BotTokenGuard.IsValid(botToken, out var botTokenProblem);
builder.Services.AddHttpClient("tgwebhook").RemoveAllLoggers().AddTypedClient<ITelegramBotClient>(
    httpClient => botTokenUsable
        ? new TelegramBotClient(botToken!, httpClient)
        : new SuperBot.BotApi.Services.UnconfiguredTelegramBotClient(botTokenProblem));
builder.Services.ConfigureTelegramBotMvc();

builder.Services.AddSingleton<IResourceService, MongoResourceService>();
builder.Services.AddSingleton<IUrlService, UrlProvider>();
builder.Services.AddTransient<ITranslationsService, TranslationsService>();
builder.Services.AddTransient<IAdminSettingsProvider, AdminSettingsProvider>();

// Состояние диалога — в Mongo (stateless-бот, переживает рестарт и масштабируется репликами).
builder.Services.AddSingleton<MongoBotStateService>();
builder.Services.AddSingleton<IBotStateReaderService>(sp => sp.GetRequiredService<MongoBotStateService>());
builder.Services.AddSingleton<IBotStateWriterService>(sp => sp.GetRequiredService<MongoBotStateService>());

builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(GetMainMenuCommand).Assembly));

builder.Services.AddSingleton<TelegramUpdateHandler>();
builder.Services.AddSingleton<TelegramInitDataValidator>();

// --- Shared-сервисы выдачи/уведомлений (Infrastructure) ---
builder.Services.AddScoped<IKeyFulfillmentService, KeyFulfillmentService>();
builder.Services.AddScoped<IBotEventPublisher, MongoBotEventPublisher>();
builder.Services.AddScoped<IBotNotificationService, BotNotificationService>();
builder.Services.AddScoped<IWishlistDiscountAlertService, WishlistDiscountAlertService>();
builder.Services.AddScoped<ISupportEscalationNotifier, SupportEscalationNotifier>();

// Единственный консюмер outbox — здесь, в бот-сервисе.
builder.Services.AddHostedService<BotOutboxWorker>();

// --- Auth (те же Keycloak-токены, что у сайта; нужен для admin/аккаунт эндпоинтов) ---
builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddTransient<IClaimsTransformation, KeycloakClaimsTransformation>();
builder.Services.AddAuthorization();

var app = builder.Build();

if (!botTokenUsable)
{
    // Одна строка уровня Error, чтобы её было видно в `docker compose logs` без grep.
    app.Logger.LogError("{Problem}", botTokenProblem);
}

app.UseForwardedHeaders();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();

public partial class Program { }
