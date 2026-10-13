using Microsoft.Extensions.Options;
using MongoDB.Driver;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Data;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Брошенные корзины: товар выбран, деньги не заплачены.
///
/// Единственный отчёт здесь, который показывает не прошлое, а **упущенное**: это деньги, до
/// которых покупатель уже почти дошёл. У ключевых магазинов возврат брошенных корзин —
/// стандартный приём, и начинается он с того, чтобы их вообще увидеть.
///
/// Брошенной считается корзина, которую не трогали дольше заданного времени И у владельца
/// которой нет оплаченного заказа после последнего изменения. Второе условие обязательно:
/// без него в список попадали бы все, кто только что успешно купил, — корзина после оплаты
/// очищается не мгновенно.
/// </summary>
public sealed class AdminAbandonedCartsService
{
    private static readonly string[] PaidStatuses = { "PAID", "PROCESSING", "AWAITING_KEYS", "DELIVERED" };

    /// <summary>
    /// Сколько корзина должна пролежать, чтобы считаться брошенной. Четыре часа — компромисс:
    /// меньше значит ловить тех, кто просто отошёл от компьютера, больше — узнавать о потере,
    /// когда человек уже купил в другом месте.
    /// </summary>
    public const int DefaultIdleHours = 4;

    private readonly IMongoDatabase _database;
    private readonly StorefrontCurrencyOptions _currencies;
    private readonly AbandonedCartReminderService _reminders;

    public AdminAbandonedCartsService(
        IMongoDatabase database,
        IOptions<StorefrontCurrencyOptions> currencies,
        AbandonedCartReminderService reminders)
    {
        _database = database;
        _currencies = currencies.Value;
        _reminders = reminders;
    }

    public async Task<AbandonedCartsDto> BuildAsync(int idleHours, CancellationToken ct = default)
    {
        var carts = _database.GetCollection<CartDb>("Cart");
        var orders = _database.GetCollection<OrderDb>("Orders");

        var now = DateTime.UtcNow;
        var cutoff = now.AddHours(-Math.Max(1, idleHours));

        var all = await carts.Find(Builders<CartDb>.Filter.Empty).ToListAsync(ct);

        // Последняя оплата каждого покупателя — чтобы отсеять тех, кто уже купил.
        var paidOrders = await orders
            .Find(Builders<OrderDb>.Filter.In(o => o.Status, PaidStatuses))
            .Project(o => new { o.UserId, o.PaidAt, o.OrderDate })
            .ToListAsync(ct);

        var lastPaidByUser = paidOrders
            .Where(o => !string.IsNullOrWhiteSpace(o.UserId))
            .GroupBy(o => o.UserId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Max(o => o.PaidAt ?? o.OrderDate), StringComparer.OrdinalIgnoreCase);

        var rows = new List<AbandonedCartRowDto>();
        var withoutTimestamp = 0;

        foreach (var cart in all)
        {
            var items = cart.CartGames ?? Array.Empty<CartGameDb>();
            if (items.Length == 0)
            {
                continue;
            }

            if (cart.UpdatedAt is not { } updatedAt)
            {
                // Корзина из времён до отметки времени: сказать, брошена ли она, нечем.
                // Считаем отдельно, а не тащим в список — иначе первый же отчёт показал бы
                // старьё как свежую потерю.
                withoutTimestamp++;
                continue;
            }

            if (updatedAt > cutoff)
            {
                continue; // ещё «живая»
            }

            if (!string.IsNullOrWhiteSpace(cart.UserId)
                && lastPaidByUser.TryGetValue(cart.UserId, out var lastPaid)
                && lastPaid >= updatedAt)
            {
                continue; // человек уже заплатил после того, как трогал корзину
            }

            rows.Add(new AbandonedCartRowDto
            {
                UserId = cart.UserId,
                // Почта видна только у зарегистрированных: у гостей идентификатор анонимный,
                // и написать им некуда — это видно сразу, а не после попытки отправить.
                Contactable = EmailAddress.LooksLikeEmail(cart.UserId),
                Items = items.Sum(item => item.Quantity),
                Value = items.Sum(item => item.Price * item.Quantity),
                UpdatedAtUtc = updatedAt,
                IdleHours = (int)Math.Floor((now - updatedAt).TotalHours)
            });
        }

        var ordered = rows.OrderByDescending(r => r.Value).ToList();

        // Кому уже писали. Без этой отметки одну и ту же корзину напоминают по второму кругу,
        // а получатель видит только назойливость.
        var reminded = await _reminders.SentForAsync(ordered.Select(r => r.UserId ?? string.Empty), ct);
        foreach (var row in ordered)
        {
            if (!string.IsNullOrWhiteSpace(row.UserId) && reminded.TryGetValue(row.UserId, out var sentAt))
            {
                row.RemindedAtUtc = sentAt;
            }
        }

        return new AbandonedCartsDto
        {
            GeneratedAtUtc = now,
            BaseCurrency = _currencies.Base,
            IdleHours = idleHours,
            Rows = ordered,
            Totals = new AbandonedCartsTotalsDto
            {
                Carts = ordered.Count,
                Items = ordered.Sum(r => r.Items),
                Value = ordered.Sum(r => r.Value),
                Contactable = ordered.Count(r => r.Contactable),
                Reminded = ordered.Count(r => r.RemindedAtUtc.HasValue),
                CartsWithoutTimestamp = withoutTimestamp
            }
        };
    }

}

public sealed class AbandonedCartRowDto
{
    public string? UserId { get; set; }

    /// <summary>Есть ли куда написать. У гостя идентификатор анонимный — связи с ним нет.</summary>
    public bool Contactable { get; set; }

    public int Items { get; set; }
    public decimal Value { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
    public int IdleHours { get; set; }

    /// <summary>Когда по этой корзине уже отправляли напоминание. null — не писали ни разу.</summary>
    public DateTime? RemindedAtUtc { get; set; }
}

public sealed class AbandonedCartsTotalsDto
{
    public int Carts { get; set; }
    public int Items { get; set; }
    public decimal Value { get; set; }
    public int Contactable { get; set; }

    /// <summary>Скольким уже писали — чтобы кнопка «напомнить» не обещала больше, чем сделает.</summary>
    public int Reminded { get; set; }

    /// <summary>Корзин без отметки времени — о них сказать нечего, пока их не тронут снова.</summary>
    public int CartsWithoutTimestamp { get; set; }
}

public sealed class AbandonedCartsDto
{
    public DateTime GeneratedAtUtc { get; set; }
    public string BaseCurrency { get; set; } = "USD";
    public int IdleHours { get; set; }
    public List<AbandonedCartRowDto> Rows { get; set; } = new();
    public AbandonedCartsTotalsDto Totals { get; set; } = new();
}
