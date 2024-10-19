using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Localization;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Application.Commands;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Services;
using SuperBot.Infrastructure.Models;
using SuperBot.WebApi;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Types;
using System.Globalization;
using Telegram.Bot;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
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


builder.Services.AddControllers();

builder.Services.AddTransient<IResourceService, JsonResourceService>();
builder.Services.AddTransient<ITranslationsService, TranslationsService>();

//builder.Configu.AddAutoMapper(typeof(GameProfile));
builder.Services.AddAutoMapper(typeof(GameProfile));

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Поддержка локализации
var supportedCultures = new[] { "en-US", "ru-RU" };
var localizationOptions = new RequestLocalizationOptions()
    .SetDefaultCulture("ru-RU")
    .AddSupportedCultures(supportedCultures)
    .AddSupportedUICultures(supportedCultures);

app.UseRequestLocalization(localizationOptions);

app.UseHttpsRedirection();

app.MapControllers();

app.Run();
