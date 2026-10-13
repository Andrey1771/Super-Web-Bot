using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Финансовые отчёты админки. Пока один — за период; разбивка по играм и склад в деньгах
/// встанут сюда же рядом.
/// </summary>
[ApiController]
[Route("api/admin/reports")]
[Authorize(Roles = "admin")]
public class AdminReportsController : ControllerBase
{
    /// <summary>Разумный потолок окна: годовой отчёт нужен, десятилетний — почти наверняка опечатка в дате.</summary>
    private const int MaxDays = 366;

    /// <summary>Сколько писем-напоминаний разрешено отправить одним нажатием.</summary>
    private const int MaxReminderBatch = 50;

    private readonly AdminPeriodReportService _report;
    private readonly AdminGameSalesReportService _games;
    private readonly AdminInventoryValueReportService _inventory;
    private readonly AdminFunnelReportService _funnel;
    private readonly AdminChannelReportService _channels;
    private readonly AdminAbandonedCartsService _carts;
    private readonly AdminChannelSpendService _spend;
    private readonly AbandonedCartReminderService _reminders;

    public AdminReportsController(
        AdminPeriodReportService report,
        AdminGameSalesReportService games,
        AdminInventoryValueReportService inventory,
        AdminFunnelReportService funnel,
        AdminChannelReportService channels,
        AdminAbandonedCartsService carts,
        AdminChannelSpendService spend,
        AbandonedCartReminderService reminders)
    {
        _report = report;
        _games = games;
        _inventory = inventory;
        _funnel = funnel;
        _channels = channels;
        _carts = carts;
        _spend = spend;
        _reminders = reminders;
    }

    /// <summary>
    /// Выручка, возвраты, себестоимость и валовая прибыль за период.
    /// Границы — UTC; to не включается, чтобы соседние периоды не считали один день дважды.
    /// </summary>
    [HttpGet("period")]
    public async Task<IActionResult> Period([FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct)
    {
        var (fromUtc, toUtc, error) = ResolveRange(from, to);
        if (error is not null)
        {
            return BadRequest(new { message = error });
        }
        return Ok(await _report.BuildAsync(fromUtc, toUtc, ct));
    }

    /// <summary>
    /// Продажи в разрезе игр за период: выручка, себестоимость, маржа — и отдельно те, что
    /// лежат без движения.
    /// </summary>
    [HttpGet("games")]
    public async Task<IActionResult> Games([FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct)
    {
        var (fromUtc, toUtc, error) = ResolveRange(from, to);
        if (error is not null)
        {
            return BadRequest(new { message = error });
        }
        return Ok(await _games.BuildAsync(fromUtc, toUtc, ct));
    }

    /// <summary>
    /// Склад в деньгах: сколько ключей лежит и на какую сумму закуплено. Без периода —
    /// это снимок на сейчас, а не итог за отрезок времени.
    /// </summary>
    [HttpGet("inventory")]
    public async Task<IActionResult> Inventory(CancellationToken ct) => Ok(await _inventory.BuildAsync(ct));

    /// <summary>
    /// Воронка магазина за период: сколько людей дошло от просмотра игры до оплаты.
    /// </summary>
    [HttpGet("funnel")]
    public async Task<IActionResult> Funnel([FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct)
    {
        var (fromUtc, toUtc, error) = ResolveRange(from, to);
        if (error is not null)
        {
            return BadRequest(new { message = error });
        }
        return Ok(await _funnel.BuildAsync(fromUtc, toUtc, ct));
    }

    /// <summary>
    /// Каналы привлечения за период: выручка, себестоимость, маржа — и доля повторных покупателей.
    /// </summary>
    [HttpGet("channels")]
    public async Task<IActionResult> Channels([FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct)
    {
        var (fromUtc, toUtc, error) = ResolveRange(from, to);
        if (error is not null)
        {
            return BadRequest(new { message = error });
        }
        return Ok(await _channels.BuildAsync(fromUtc, toUtc, ct));
    }

    /// <summary>
    /// Брошенные корзины: товар выбран, деньги не заплачены. Периода нет — это снимок на сейчас.
    /// </summary>
    [HttpGet("abandoned-carts")]
    public async Task<IActionResult> AbandonedCarts([FromQuery] int idleHours = AdminAbandonedCartsService.DefaultIdleHours, CancellationToken ct = default)
    {
        if (idleHours is < 1 or > 24 * 30)
        {
            return BadRequest(new { message = "Idle hours must be between 1 and 720." });
        }
        return Ok(await _carts.BuildAsync(idleHours, ct));
    }

    /// <summary>
    /// Отправить напоминания по выбранным корзинам.
    ///
    /// Только по явному нажатию и только по перечисленным адресам: письмо уходит человеку,
    /// который ничего не заказывал, и такое решение принимает не расписание. Автоматической
    /// рассылки в этом коде нет намеренно.
    /// </summary>
    [HttpPost("abandoned-carts/remind")]
    public async Task<IActionResult> RemindAbandonedCarts([FromBody] RemindCartsRequest request, CancellationToken ct)
    {
        if (request?.UserIds is null || request.UserIds.Count == 0)
        {
            return BadRequest(new { message = "Pick at least one cart to remind." });
        }
        if (request.UserIds.Count > MaxReminderBatch)
        {
            // Потолок на пачку: письма уходят по одному, и случайное «выделить всё» на большом
            // магазине не должно превращаться в многочасовую отправку из одного запроса.
            return BadRequest(new { message = $"No more than {MaxReminderBatch} carts at a time." });
        }

        return Ok(await _reminders.SendAsync(request.UserIds, ct));
    }

    /// <summary>Траты на привлечение за период.</summary>
    [HttpGet("channel-spend")]
    public async Task<IActionResult> ChannelSpend([FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct)
    {
        var (fromUtc, toUtc, error) = ResolveRange(from, to);
        if (error is not null)
        {
            return BadRequest(new { message = error });
        }
        return Ok(await _spend.ListAsync(fromUtc, toUtc, ct));
    }

    /// <summary>Занести трату: источник, день, сумма. Берётся из рекламного кабинета руками.</summary>
    [HttpPost("channel-spend")]
    public async Task<IActionResult> AddChannelSpend([FromBody] ChannelSpendRequest request, CancellationToken ct)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Source))
        {
            return BadRequest(new { message = "Source is required." });
        }
        if (request.Amount <= 0)
        {
            return BadRequest(new { message = "Amount must be greater than zero." });
        }
        if (request.SpentOn is null)
        {
            return BadRequest(new { message = "Date is required." });
        }

        return Ok(await _spend.AddAsync(request.Source, request.SpentOn.Value.ToUniversalTime(), request.Amount, request.Currency, request.Note, ct));
    }

    [HttpDelete("channel-spend/{id}")]
    public async Task<IActionResult> DeleteChannelSpend(string id, CancellationToken ct) =>
        await _spend.DeleteAsync(id, ct) ? NoContent() : NotFound();

    /// <summary>Границы периода и их проверка — одни на все отчёты, чтобы не разъезжались.</summary>
    private static (DateTime From, DateTime To, string? Error) ResolveRange(DateTime? from, DateTime? to)
    {
        // По умолчанию — последние 30 дней: самый частый вопрос «как прошёл месяц».
        var toUtc = (to ?? DateTime.UtcNow).ToUniversalTime();
        var fromUtc = (from ?? toUtc.AddDays(-30)).ToUniversalTime();

        if (fromUtc >= toUtc)
        {
            return (fromUtc, toUtc, "The start of the period must be earlier than its end.");
        }
        if ((toUtc - fromUtc).TotalDays > MaxDays)
        {
            return (fromUtc, toUtc, $"The period is longer than {MaxDays} days — narrow it down.");
        }
        return (fromUtc, toUtc, null);
    }
}

/// <summary>Кому из брошенных корзин решено написать.</summary>
public class RemindCartsRequest
{
    /// <summary>Владельцы корзин, которым решено написать. Пусто — ничего не отправляется.</summary>
    public List<string> UserIds { get; set; } = new();
}

/// <summary>Трата на привлечение: источник, день и сумма из рекламного кабинета.</summary>
public class ChannelSpendRequest
{
    public string Source { get; set; } = string.Empty;
    public DateTime? SpentOn { get; set; }
    public decimal Amount { get; set; }
    public string? Currency { get; set; }
    public string? Note { get; set; }
}
