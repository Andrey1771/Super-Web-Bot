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

    /// <summary>Папка загрузок тестового хоста: во временной директории, а не в wwwroot репозитория.</summary>
    public string UploadsRoot { get; } = Path.Combine(Path.GetTempPath(), $"taleshop-tests-uploads-{Guid.NewGuid():N}");

    public CapturingMailSender Mail { get; } = new();

    /// <summary>Stripe в памяти вместо сети — через него тесты «оплачивают» намерения.</summary>
    public FakeStripePaymentIntentGateway Stripe { get; } = new();

    /// <summary>Клиент и карты кабинета — тоже в памяти: без этого не проверить, что в Stripe не ходили.</summary>
    public FakeStripeCustomerGateway StripeCustomers { get; } = new();

    /// <summary>Stripe Tax — в памяти: ставки по странам, записанные транзакции и сторно.</summary>
    public FakeStripeTaxGateway StripeTax { get; } = new();

    /// <summary>Секрет, которым тесты подписывают вебхуки (как это делает настоящий Stripe).</summary>
    public const string WebhookSecret = "whsec_test_secret_for_integration_tests";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Та же major-версия, что в docker-compose. Бинарники mongod EphemeralMongo скачивает
        // при первом прогоне в локальную папку данных пользователя и дальше берёт оттуда.
        _mongo = MongoRunner.Run(new MongoRunnerOptions
        {
            Version = MongoVersion.V8,
            UseSingleNodeReplicaSet = false,
        });

        builder.UseEnvironment("Development");

        builder.UseSetting("ConnectionStrings:MongoDb", _mongo.ConnectionString);
        builder.UseSetting("Uploads:Root", UploadsRoot);
        builder.UseSetting("ConnectionStrings:Name", $"taleshop_tests_{Guid.NewGuid():N}");

        // Валидный ФОРМАТ токена, чтобы конструктор TelegramBotClient не падал; наружу ничего не уходит.
        builder.UseSetting("BotConfiguration:BotToken", "123456:TEST-TOKEN-NOT-REAL");

        // Обязательные настройки проверяются при старте, и тестовый хост — то же приложение.
        // Значения выдуманные: настоящий Keycloak в тестах заменён на TestAuthHandler, наружу
        // с ними никто не ходит. Важно лишь, что они не пустые.
        builder.UseSetting("Keycloak:Admin:BaseUrl", "http://keycloak.test");
        builder.UseSetting("Keycloak:Admin:Realm", "TaleShop");
        builder.UseSetting("Keycloak:Admin:ClientId", "tale-shop-admin");
        builder.UseSetting("Keycloak:Admin:ClientSecret", "test-secret-not-used");

        // Ссылки в письмах (confirm/unsubscribe) — фиксированная база для ассертов.
        builder.UseSetting("Recovery:PublicBaseUrl", "http://taleshop.test");

        // Ollama в тестах недоступен — глушим на заведомо мёртвый порт (агент чата тут не гоняется).
        builder.UseSetting("SupportChat:OllamaBaseUrl", "http://127.0.0.1:59999");

        // Проверки здоровья не должны стучаться наружу: набор не имеет права зависеть от
        // доступности Stripe, почты и Keycloak, а их таймауты складывались бы в минуты.
        builder.UseSetting("Dashboard:ExternalProbes", "false");

        // Планировщик Hangfire в тестовом хосте не нужен (и его Mongo-миграции — главный
        // кандидат на зависание при старте под WebApplicationFactory).
        builder.UseSetting("Hangfire:Enabled", "false");

        // Приглашения оставить отзыв включены: расписания в тестах нет (Hangfire выключен),
        // и рассылка срабатывает только когда тест сам вызывает ReviewInviteService.RunAsync.
        builder.UseSetting("ReviewInvites:Enabled", "true");

        // Кэшбэк включён: сквозные тесты оплаты проверяют начисление и возвраты.
        // Страховочная задача без Hangfire не ходит — тесты зовут её сами.
        builder.UseSetting("Cashback:Enabled", "true");

        // Без секрета вебхук отклоняет всё (fail-closed) — тестам нужен известный секрет,
        // чтобы подписывать запросы ровно так же, как это делает Stripe.
        builder.UseSetting("Stripe:WebhookSecret", WebhookSecret);
        builder.UseSetting("Stripe:SecretKey", "sk_test_not_used_gateway_is_faked");

        builder.ConfigureTestServices(services =>
        {
            // Фоновые циклы не нужны: рассылку двигаем руками через INewsletterDispatcher,
            // а Ollama-логгер только шумит в тестовом выводе.
            RemoveHostedService<NewsletterSendWorker>(services);
            RemoveHostedService<SuperBot.WebApi.Support.Chat.Services.SupportLlmStartupLogger>(services);

            // Все письма — в память.
            services.RemoveAll<IMailSender>();
            services.AddSingleton<IMailSender>(Mail);

            // Пароль проверяется без Keycloak: верен только FakePasswordVerifier.CorrectPassword.
            services.RemoveAll<SuperBot.WebApi.Services.IPasswordVerifier>();
            services.AddSingleton<SuperBot.WebApi.Services.IPasswordVerifier>(new FakePasswordVerifier());

            // Stripe — в память. Это и есть тот шов, ради которого выделялся IStripePaymentIntentGateway.
            services.RemoveAll<SuperBot.Infrastructure.Services.IStripePaymentIntentGateway>();
            services.AddSingleton<SuperBot.Infrastructure.Services.IStripePaymentIntentGateway>(Stripe);
            services.RemoveAll<SuperBot.Infrastructure.Services.IStripeCustomerGateway>();
            services.AddSingleton<SuperBot.Infrastructure.Services.IStripeCustomerGateway>(StripeCustomers);
            services.RemoveAll<SuperBot.Infrastructure.Services.IStripeTaxGateway>();
            services.AddSingleton<SuperBot.Infrastructure.Services.IStripeTaxGateway>(StripeTax);

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
        try
        {
            if (Directory.Exists(UploadsRoot))
            {
                Directory.Delete(UploadsRoot, recursive: true);
            }
        }
        catch (IOException)
        {
            // Временная папка; не удалилась — останется в Temp, тесты это не ломает.
        }
        if (!disposing)
        {
            return;
        }

        _mongo?.Dispose();
    }
}
