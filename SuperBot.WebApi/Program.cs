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

var builder = WebApplication.CreateBuilder(args);

// !!! Êîíôèãóðèðóåì îáðàáîòêó ïåðåñûëàåìûõ çàãîëîâêîâ çàïðîñîâ
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
});
// !!! Êîíôèãóðèðóåì îáðàáîòêó ïåðåñûëàåìûõ çàãîëîâêîâ çàïðîñîâ

// Add services to the container.
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.CustomSchemaIds(type => type.FullName); // Èñïîëüçóåì ïîëíîå èìÿ òèïà
});


// Äîáàâëåíèå CORS ñ êîíêðåòíîé ïîëèòèêîé
builder.Services.AddCors(options =>
{
    var frontendConfigSection = builder.Configuration.GetSection("FrontendConfiguration");
    options.AddPolicy("AllowSpecificOrigin",
        builder =>
        {
            builder.WithOrigins(frontendConfigSection.GetValue<string>("Uri") ?? "") // TODO!!!!!!
                   .AllowAnyHeader()
                   .AllowAnyMethod()
builder.Services.AddScoped<AccountOverviewService>();
                   .AllowCredentials(); // Åñëè íåîáõîäèìû êóêè/ó÷åòíûå äàííûå
        });
});

builder.Services.Configure<StripeSettings>(builder.Configuration.GetSection("Stripe"));

builder.Services.AddControllers();

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
// Ðåãèñòðàöèÿ MongoDatabase
builder.Services.AddScoped<IMongoDatabase>(sp =>
{
    var mongoClient = sp.GetRequiredService<IMongoClient>();

    var mongoName = builder.Configuration.GetSection("ConnectionStrings:Name").Value;
    return mongoClient.GetDatabase(mongoName);  // Óêàæèòå èìÿ âàøåé áàçû äàííûõ
});
builder.Services.AddScoped<MongoDbInitializer>();

builder.Services.AddScoped<IGameRepository, GameMongoDbRepository>();
builder.Services.AddScoped<IOrderRepository, OrderMongoDbRepository>();
builder.Services.AddScoped<IUserRepository, UserMongoDbRepository>();
builder.Services.AddScoped<ISteamOrderRepository, SteamOrderMongoDbRepository>();
builder.Services.AddScoped<ISettingsRepository, SettingsMongoDbRepository>();
builder.Services.AddScoped<ICartRepository, CartMongoDbRepository>();



builder.Services.AddAutoMapper(typeof(GameProfile));
builder.Services.AddAutoMapper(typeof(CartGameProfile));

//TODO Çàãîòîâêà íà äèíàìè÷åñêèå æàíðû èãð, åñëè ó íàñ íåò íàñòðîåê, òî äîáàâëÿåì èõ
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

// Äîáàâëåíèå Hangfire ñ èñïîëüçîâàíèåì MongoDB
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

// Äîáàâëåíèå Dashboard è ñåðâåðîâ Hangfire
builder.Services.AddHangfireServer();


builder.Services.AddHttpClient<IKeycloakClient, KeycloakClient>((httpClient) =>
{
    var uri = builder.Configuration["Keycloak:Uri"];
    httpClient.BaseAddress = new Uri(uri);
    return new KeycloakClient(httpClient, uri);
});

builder.Services.AddScoped<IBackgroundTaskService, BackgroundTaskService>();

builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddTransient<IClaimsTransformation, KeycloakClaimsTransformation>();

builder.Services.AddLogging(logging =>
{
    logging.AddConsole();
    logging.AddDebug();
});

var app = builder.Build();

// !!! Äîáàâëÿåì â êîíâååð îáðàáîòêè HTTP-çàïðîñà êîìïîíåíò ðàáîòû ñ ïåðåñûëàåìûìè çàãîëîâêàìè
app.UseForwardedHeaders();
// !!! Äîáàâëÿåì â êîíâååð îáðàáîòêè HTTP-çàïðîñà êîìïîíåíò ðàáîòû ñ ïåðåñûëàåìûìè çàãîëîâêàìè

StripeConfiguration.ApiKey = builder.Configuration["Stripe:SecretKey"];

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseHangfireDashboard();
}

// Ïîëó÷àåì èíèöèàëèçàòîð èç DI-êîíòåéíåðà è âûïîëíÿåì èíèöèàëèçàöèþ
using (var scope = app.Services.CreateScope())
{
    var mongoDbInitializer = scope.ServiceProvider.GetRequiredService<MongoDbInitializer>();
    await mongoDbInitializer.InitializeAsync(); // Èíèöèàëèçàöèÿ áàçû äàííûõ
}

// Ïîääåðæêà ëîêàëèçàöèè
var supportedCultures = new[] { "en-US", "ru-RU" };
var localizationOptions = new RequestLocalizationOptions()
    .SetDefaultCulture("ru-RU")
    .AddSupportedCultures(supportedCultures)
    .AddSupportedUICultures(supportedCultures);

app.UseRequestLocalization(localizationOptions);

app.UseHttpsRedirection();

app.UseCors("AllowSpecificOrigin");

var uploadsPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot/uploads");

if (!Directory.Exists(uploadsPath))
{
    Directory.CreateDirectory(uploadsPath);
}

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadsPath),
    RequestPath = "/wwwroot/uploads"
});

app.MapControllers();

using (var scope = app.Services.CreateScope())
{
    var recurringJobManager = scope.ServiceProvider.GetRequiredService<IRecurringJobManager>();
    // Ïåðèîäè÷åñêàÿ çàäà÷à
    recurringJobManager.AddOrUpdate(
        "clear-old-order-records",
        () => scope.ServiceProvider.GetRequiredService<IBackgroundTaskService>().ScheduleClearOutdatedDataJob(),
        Cron.Daily);
}

app.UseAuthentication();
app.UseAuthorization();

app.Run();