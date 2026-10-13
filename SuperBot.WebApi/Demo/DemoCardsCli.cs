using Stripe;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Demo;

/// <summary>
/// Сохранённые карты демо-админа: Billing → Saved payment methods у него не пустой, а с тестовыми картами Stripe —
/// так видно, как выглядят карты в кабинете. Сам он привязать карту не может («только просмотр»), поэтому карты
/// привязываются отсюда, от имени сервера.
///
///   docker compose run --rm --no-deps backend demo-cards &lt;sub демо-админа в Keycloak&gt; [email]
///
/// Обычно запускается из deploy/demo/demo-admin-cards.sh (он находит sub). Повторный запуск безопасен: карта, которая
/// уже есть (та же система и последние цифры), второй раз не привязывается. Только с тестовым ключом Stripe.
/// </summary>
public static class DemoCardsCli
{
    public const string Command = "demo-cards";

    /// <summary>
    /// Тестовые карты Stripe (docs.stripe.com/testing) — первая станет основной. Карты с отказом банка
    /// (4000 0000 0000 0002, …9995) Stripe привязать не даёт, поэтому их здесь нет.
    /// </summary>
    private static readonly (string Token, string Brand, string Last4)[] Cards =
    [
        ("pm_card_visa", "visa", "4242"),
        ("pm_card_mastercard", "mastercard", "4444"),
        ("pm_card_authenticationRequiredOnSetup", "visa", "3155"),
    ];

    public static async Task<int> RunAsync(IServiceProvider services, string[] args)
    {
        if (args.Length < 1 || string.IsNullOrWhiteSpace(args[0]))
        {
            Console.Error.WriteLine("demo-cards: usage — demo-cards <keycloak user id (sub)> [email]");
            return 1;
        }
        var userId = args[0].Trim();
        var email = args.Length > 1 ? args[1].Trim() : string.Empty;

        using var scope = services.CreateScope();
        var sp = scope.ServiceProvider;
        var config = sp.GetRequiredService<IConfiguration>();
        if (!config.GetValue<bool>("Demo:Enabled"))
        {
            Console.Error.WriteLine("demo-cards: Demo:Enabled is false — this is not a demo site, nothing done.");
            return 1;
        }
        var stripeKey = config["Stripe:SecretKey"] ?? string.Empty;
        if (!stripeKey.StartsWith("sk_test_", StringComparison.Ordinal))
        {
            Console.Error.WriteLine("demo-cards: Stripe:SecretKey is not a test key — refusing to attach cards.");
            return 1;
        }
        // Обычно ставится позже, при старте веб-приложения; команда выполняется раньше.
        StripeConfiguration.ApiKey = stripeKey;

        var profiles = sp.GetRequiredService<IBillingProfileRepository>();
        var gateway = sp.GetRequiredService<IStripeCustomerGateway>();

        var profile = await profiles.GetByUserIdAsync(userId) ?? new BillingProfile
        {
            UserId = userId,
            DisplayName = "demo-admin",
            Email = email
        };
        if (string.IsNullOrWhiteSpace(profile.StripeCustomerId))
        {
            // Тот же ключ идемпотентности, что у кабинета (BillingCustomers): покупатель Stripe у человека один.
            profile.StripeCustomerId = await gateway.CreateCustomerAsync(profile.Email, profile.DisplayName, $"billing-customer:{userId}");
            await profiles.UpsertAsync(profile);
        }
        var customerId = profile.StripeCustomerId;

        var existing = await gateway.ListCardsAsync(customerId);
        var paymentMethods = new PaymentMethodService();
        string? firstId = null;
        var attached = 0;
        foreach (var (token, brand, last4) in Cards)
        {
            var have = existing.FirstOrDefault(c =>
                string.Equals(c.Brand, brand, StringComparison.OrdinalIgnoreCase) && c.Last4 == last4);
            var id = have?.Id;
            if (id == null)
            {
                var method = await paymentMethods.AttachAsync(token, new PaymentMethodAttachOptions { Customer = customerId });
                id = method.Id;
                attached++;
            }
            firstId ??= id;
        }

        if (firstId != null && profile.DefaultPaymentMethodId != firstId)
        {
            await gateway.SetDefaultCardAsync(customerId, firstId);
            profile.DefaultPaymentMethodId = firstId;
            await profiles.UpsertAsync(profile);
        }

        Console.WriteLine($"demo-cards: {attached} attached, {Cards.Length - attached} already there; default — Visa 4242.");
        return 0;
    }
}
