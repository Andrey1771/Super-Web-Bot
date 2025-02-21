using Microsoft.AspNetCore.Localization;
using SuperBot.Application.Commands.Telegram;
using SuperBot.BotApi.Services;
using SuperBot.BotApi.Types;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IBotStateService;
using SuperBot.Core.Services;
using SuperBot.Infrastructure.ExternalServices;
using System.Globalization;
using Telegram.Bot;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();


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

builder.Services.AddTransient<IResourceService, JsonResourceService>();
builder.Services.AddSingleton<IUrlService, UrlProvider>();

builder.Services.AddTransient<ITranslationsService, TranslationsService>();

builder.Services.AddSingleton<BotStateService>();
builder.Services.AddSingleton<IBotStateReaderService>(provider => provider.GetRequiredService<BotStateService>());
builder.Services.AddSingleton<IBotStateWriterService>(provider => provider.GetRequiredService<BotStateService>());

builder.Services.AddTransient<IAdminSettingsProvider, AdminSettingsProvider>();

builder.Services.AddTransient<IPayService, YooKassaService>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
