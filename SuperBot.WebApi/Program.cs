using Hangfire;
using Hangfire.Mongo;
using Hangfire.Mongo.Migration.Strategies.Backup;
using Hangfire.Mongo.Migration.Strategies;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Localization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IBotStateService;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;
using SuperBot.Infrastructure.ExternalServices;
using SuperBot.Infrastructure.Models;
using SuperBot.Infrastructure.Repositories;
using SuperBot.WebApi;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Types;
using System.Globalization;
using Telegram.Bot;
using System.Diagnostics;
using SuperBot.Application.Commands.Telegram;
using Microsoft.Extensions.FileProviders;
using SuperBot.Core.Entities;
using AutoMapper;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.CustomSchemaIds(type => type.FullName); // Используем полное имя типа
});


// Добавляем поддержку локализации
builder.Services.AddLocalization(options => options.ResourcesPath = "Resources");

builder.Services.Configure<RequestLocalizationOptions>(options =>
{
    var supportedCultures = new[]
    {
            new CultureInfo("en-US"),
            new CultureInfo("ru-RU")
        };

    options.DefaultRequestCulture = new RequestCulture("en-US");
    options.SupportedCultures = supportedCultures;
    options.SupportedUICultures = supportedCultures;
});

// Setup bot configuration
var botConfigSection = builder.Configuration.GetSection("BotConfiguration");
builder.Services.Configure<BotConfiguration>(botConfigSection);
builder.Services.AddHttpClient("tgwebhook").RemoveAllLoggers().AddTypedClient<ITelegramBotClient>(
    httpClient => new TelegramBotClient(botConfigSection.Get<BotConfiguration>()!.BotToken, httpClient));
builder.Services.AddSingleton<UpdateHandler>();

builder.Services.ConfigureTelegramBotMvc();

var domainAssembly = typeof(GetMainMenuCommand).Assembly;
builder.Services
    .AddMediatR(cfg => cfg.RegisterServicesFromAssembly(domainAssembly));


// Добавление CORS с конкретной политикой
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowSpecificOrigin",
        builder =>
        {
            builder.WithOrigins("http://localhost:3000") // Замените на URL вашего клиента
                   .AllowAnyHeader()
                   .AllowAnyMethod()
                   .AllowCredentials(); // Если необходимы куки/учетные данные
        });
});

builder.Services.AddControllers();

builder.Services.AddTransient<IResourceService, JsonResourceService>();
builder.Services.AddTransient<ITranslationsService, TranslationsService>();
builder.Services.AddSingleton<IUrlService, UrlProvider>();


builder.Services.AddSingleton<BotStateService>();
builder.Services.AddSingleton<IBotStateReaderService>(provider => provider.GetRequiredService<BotStateService>());
builder.Services.AddSingleton<IBotStateWriterService>(provider => provider.GetRequiredService<BotStateService>());


builder.Services.AddSingleton<IMongoClient, MongoClient>(sp =>
{
    var connectionString = builder.Configuration.GetSection("ConnectionStrings:MongoDb").Value;
    return new MongoClient(connectionString);
});
// Регистрация MongoDatabase
builder.Services.AddScoped<IMongoDatabase>(sp =>
{
    var mongoClient = sp.GetRequiredService<IMongoClient>();

    var mongoName = builder.Configuration.GetSection("ConnectionStrings:Name").Value;
    return mongoClient.GetDatabase(mongoName);  // Укажите имя вашей базы данных
});
builder.Services.AddScoped<MongoDbInitializer>();

builder.Services.AddScoped<IGameRepository, GameMongoDbRepository>();
builder.Services.AddScoped<IOrderRepository, OrderMongoDbRepository>();
builder.Services.AddScoped<IUserRepository, UserMongoDbRepository>();
builder.Services.AddScoped<ISteamOrderRepository, SteamOrderMongoDbRepository>();
builder.Services.AddScoped<ISettingsRepository, SettingsMongoDbRepository>();


builder.Services.AddTransient<IPayService, YooKassaService>();

builder.Services.AddTransient<IAdminSettingsProvider, AdminSettingsProvider>();

//builder.Configu.AddAutoMapper(typeof(GameProfile));
builder.Services.AddAutoMapper(typeof(GameProfile));
//builder.Services.AddAutoMapper(typeof(OrderProfile));
//builder.Services.AddAutoMapper(typeof(SettingsProfile));
//builder.Services.AddAutoMapper(typeof(SteamOrderProfile));
//builder.Services.AddAutoMapper(typeof(UserProfile));

//TODO Заготовка на динамические жанры игр, если у нас нет настроек, то добавляем их
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
            GameCategories = gameCategories.ToArray(),
        };
        await repository.CreateAsync(newSettings);
    }
}

// Добавление Hangfire с использованием MongoDB
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

// Добавление Dashboard и серверов Hangfire
builder.Services.AddHangfireServer();


builder.Services.AddScoped<IBackgroundTaskService, BackgroundTaskService>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseHangfireDashboard();
}

// Получаем инициализатор из DI-контейнера и выполняем инициализацию
using (var scope = app.Services.CreateScope())
{
    var mongoDbInitializer = scope.ServiceProvider.GetRequiredService<MongoDbInitializer>();
    await mongoDbInitializer.InitializeAsync(); // Инициализация базы данных
}

// Поддержка локализации
var supportedCultures = new[] { "en-US", "ru-RU" };
var localizationOptions = new RequestLocalizationOptions()
    .SetDefaultCulture("ru-RU")
    .AddSupportedCultures(supportedCultures)
    .AddSupportedUICultures(supportedCultures);

app.UseRequestLocalization(localizationOptions);

app.UseHttpsRedirection();

app.UseCors("AllowSpecificOrigin");

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(Path.Combine(Directory.GetCurrentDirectory(), "wwwroot/uploads")),
    RequestPath = "/wwwroot/uploads"
});

app.MapControllers();

// Периодическая задача
RecurringJob.AddOrUpdate<IBackgroundTaskService>(
                "clear-old-order-records",
                x => x.ScheduleClearOutdatedDataJob(),
                Cron.Daily);
app.Run();