using EphemeralMongo;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using SuperBot.WebApi.Mail;
using SuperBot.WebApi.Newsletter;

namespace SuperBot.WebApi.Tests.Infrastructure;

/// <summary>
/// Поднимает НАСТОЯЩЕЕ приложение (Program.cs) в памяти для интеграционных тестов:
///  - MongoDB — эфемерный mongod (EphemeralMongo), отдельная БД на прогон, docker не нужен;
///  - почта — CapturingMailSender вместо SMTP (письма проверяются в тестах);
///  - аутентификация — TestAuthHandler вместо Keycloak (личность из заголовков);
///  - фоновые воркеры отключены — пайплайн рассылки гоняется детерминированно через INewsletterDispatcher.
/// </summary>
public class TaleShopApiFactory : WebApplicationFactory<Program>
{
    private IMongoRunner? _mongo;
    private int? _mongoPid;

    public CapturingMailSender Mail { get; } = new();

    /// <summary>Stripe в памяти вместо сети — через него тесты «оплачивают» намерения.</summary>
    public FakeStripePaymentIntentGateway Stripe { get; } = new();

    /// <summary>Секрет, которым тесты подписывают вебхуки (как это делает настоящий Stripe).</summary>
    public const string WebhookSecret = "whsec_test_secret_for_integration_tests";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Запоминаем PID нашего mongod: graceful shutdown EphemeralMongo6 требует сборку
        // MongoDB.Driver.Core, которой в драйвере 3.x больше нет, — гасим процесс сами (см. Dispose).
        var mongodBefore = System.Diagnostics.Process.GetProcessesByName("mongod")
            .Select(p => p.Id)
            .ToHashSet();

        _mongo = MongoRunner.Run(new MongoRunnerOptions
        {
            UseSingleNodeReplicaSet = false,
        });

        _mongoPid = System.Diagnostics.Process.GetProcessesByName("mongod")
            .Select(p => p.Id)
            .FirstOrDefault(id => !mongodBefore.Contains(id));

        builder.UseEnvironment("Development");

        builder.UseSetting("ConnectionStrings:MongoDb", _mongo.ConnectionString);
        builder.UseSetting("ConnectionStrings:Name", $"taleshop_tests_{Guid.NewGuid():N}");

        // Валидный ФОРМАТ токена, чтобы конструктор TelegramBotClient не падал; наружу ничего не уходит.
        builder.UseSetting("BotConfiguration:BotToken", "123456:TEST-TOKEN-NOT-REAL");

        // Ссылки в письмах (confirm/unsubscribe) — фиксированная база для ассертов.
        builder.UseSetting("Recovery:PublicBaseUrl", "http://taleshop.test");

        // Ollama в тестах недоступен — глушим на заведомо мёртвый порт (агент чата тут не гоняется).
        builder.UseSetting("SupportChat:OllamaBaseUrl", "http://127.0.0.1:59999");

        // Планировщик Hangfire в тестовом хосте не нужен (и его Mongo-миграции — главный
        // кандидат на зависание при старте под WebApplicationFactory).
        builder.UseSetting("Hangfire:Enabled", "false");

        // Демо-каталог не сеем в тестах: 48 игр исказили бы ассерты по данным.
        builder.UseSetting("Seed:Enabled", "false");

        // Без секрета вебхук отклоняет всё (fail-closed) — тестам нужен известный секрет,
        // чтобы подписывать запросы ровно так же, как это делает Stripe.
        builder.UseSetting("Stripe:WebhookSecret", WebhookSecret);
        builder.UseSetting("Stripe:SecretKey", "sk_test_not_used_gateway_is_faked");

        builder.ConfigureTestServices(services =>
        {
            // Фоновые циклы не нужны: рассылку двигаем руками через INewsletterDispatcher,
            // а Ollama-логгер только шумит в тестовом выводе.
            RemoveHostedService<NewsletterSendWorker>(services);
            RemoveHostedService<SuperBot.WebApi.Support.Chat.Services.OllamaStartupLogger>(services);

            // Все письма — в память.
            services.RemoveAll<IMailSender>();
            services.AddSingleton<IMailSender>(Mail);

            // Stripe — в память. Это и есть тот шов, ради которого выделялся IStripePaymentIntentGateway.
            services.RemoveAll<SuperBot.Infrastructure.Services.IStripePaymentIntentGateway>();
            services.AddSingleton<SuperBot.Infrastructure.Services.IStripePaymentIntentGateway>(Stripe);

            // Тестовая аутентификация вместо Keycloak JWT.
            services.AddAuthentication(TestAuthHandler.SchemeName)
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, _ => { });
            services.PostConfigure<AuthenticationOptions>(options =>
            {
                options.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                options.DefaultChallengeScheme = TestAuthHandler.SchemeName;
                options.DefaultScheme = TestAuthHandler.SchemeName;
            });
        });
    }

    private static void RemoveHostedService<TService>(IServiceCollection services)
        where TService : IHostedService
    {
        var descriptors = services
            .Where(d => d.ServiceType == typeof(IHostedService) && d.ImplementationType == typeof(TService))
            .ToList();
        foreach (var descriptor in descriptors)
        {
            services.Remove(descriptor);
        }
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing)
        {
            return;
        }

        try
        {
            _mongo?.Dispose();
        }
        catch
        {
            // EphemeralMongo6 не может послать shutdown-команду при MongoDB.Driver 3.x
            // (FileNotFoundException на MongoDB.Driver.Core) — данные эфемерные, просто гасим процесс.
        }
        finally
        {
            if (_mongoPid is int pid)
            {
                try
                {
                    var process = System.Diagnostics.Process.GetProcessById(pid);
                    process.Kill(entireProcessTree: true);
                }
                catch
                {
                    // Процесс уже завершён — это и есть желаемое состояние.
                }
            }
        }
    }
}
