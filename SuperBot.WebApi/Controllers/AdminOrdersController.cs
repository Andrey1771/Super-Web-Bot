using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Support.Infrastructure;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Заказы в админке: список, карточка, действия специалиста и выгрузка.
///
/// Действия — отдельные POST-эндпоинты (deliver-keys, resend-keys, refund …), а не смена
/// статуса: статус — следствие того, что реально произошло. См. <see cref="AdminOrderActionsService"/>.
/// </summary>
[ApiController]
[Route("api/admin/orders")]
[Authorize(Roles = "admin")]
public class AdminOrdersController : ControllerBase
{
    private readonly IOrderRepository _orderRepository;
    private readonly IGameRepository _gameRepository;
    private readonly AdminOrderActionsService _actions;

    public AdminOrdersController(IOrderRepository orderRepository, IGameRepository gameRepository, AdminOrderActionsService actions)
    {
        _orderRepository = orderRepository;
        _gameRepository = gameRepository;
        _actions = actions;
    }

    [HttpGet]
    public async Task<IActionResult> GetOrders(
        [FromQuery] string search = "",
        [FromQuery] string status = "",
        [FromQuery] string paymentStatus = "",
        [FromQuery] DateTime? dateFrom = null,
        [FromQuery] DateTime? dateTo = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string sort = "createdAt:desc")
    {
        var query = BuildQuery(search, status, paymentStatus, dateFrom, dateTo, page, pageSize, sort);
        var (items, total) = await _orderRepository.GetPagedAsync(query);
        var mapped = await MapOrdersAsync(items);
        return Ok(new { items = mapped, total });
    }

    /// <summary>
    /// CSV по текущему фильтру — все страницы, а не та, что на экране. Раньше кнопка «Export»
    /// собирала CSV в браузере из загруженной страницы, и «выгрузить месяц» означало двадцать файлов.
    /// </summary>
    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string search = "",
        [FromQuery] string status = "",
        [FromQuery] string paymentStatus = "",
        [FromQuery] DateTime? dateFrom = null,
        [FromQuery] DateTime? dateTo = null,
        [FromQuery] string sort = "createdAt:desc")
    {
        const int pageSize = 500;
        const int maxRows = 50_000; // предохранитель: выгрузка — не резервная копия базы

        var sb = new StringBuilder();
        sb.AppendLine("Order #,Created at (UTC),Customer,Items,Total,Currency,Status,Payment status,Payment provider,Payment intent");

        var page = 1;
        var written = 0;
        while (written < maxRows)
        {
            var query = BuildQuery(search, status, paymentStatus, dateFrom, dateTo, page, pageSize, sort);
            var (items, _) = await _orderRepository.GetPagedAsync(query);
            if (items.Count == 0)
            {
                break;
            }

            foreach (var order in items)
            {
                var itemsText = string.Join("; ", NormalizedItems(order).Select(i => $"{i.Title} ×{Math.Max(1, i.Quantity)}"));
                sb.AppendLine(string.Join(",",
                    Csv(order.OrderNumber ?? order.Id.ToString()),
                    Csv(order.OrderDate.ToUniversalTime().ToString("O")),
                    Csv(order.UserId),
                    Csv(itemsText),
                    Csv(ResolveTotal(order).ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)),
                    Csv(order.Currency ?? "USD"),
                    Csv(ResolveStatus(order)),
                    Csv(ResolvePaymentStatus(order)),
                    Csv(order.PaymentProvider),
                    Csv(order.PaymentIntentId ?? string.Empty)));
                written++;
            }

            if (items.Count < pageSize)
            {
                break;
            }
            page++;
        }

        // BOM — чтобы Excel на Windows открыл кириллицу в названиях игр без «кракозябр».
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
        return File(bytes, "text/csv; charset=utf-8", $"orders-{DateTime.UtcNow:yyyyMMdd-HHmm}.csv");
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetOrderById(string id)
    {
        var order = await _orderRepository.GetOrderByIdAsync(id);
        if (order == null)
        {
            return NotFound();
        }

        var mapped = (await MapOrdersAsync(new[] { order })).First();
        return Ok(mapped);
    }

    // ---------- действия ----------

    [HttpPost("{id}/resend-keys")]
    public Task<IActionResult> ResendKeys(string id) =>
        RunAction(id, (order, actor) => _actions.ResendKeysAsync(order, actor));

    [HttpPost("{id}/deliver-keys")]
    public Task<IActionResult> DeliverKeys(string id) =>
        RunAction(id, (order, actor) => _actions.DeliverKeysAsync(order, actor));

    [HttpPost("{id}/refund")]
    public Task<IActionResult> Refund(string id, [FromBody] OrderActionRequest request) =>
        RunAction(id, (order, actor) => _actions.RefundAsync(order, actor, request?.Reason ?? string.Empty));

    [HttpPost("{id}/mark-refunded")]
    public Task<IActionResult> MarkRefunded(string id, [FromBody] OrderActionRequest request) =>
        RunAction(id, (order, actor) => _actions.MarkRefundedAsync(order, actor, request?.Reason ?? string.Empty));

    [HttpPost("{id}/cancel")]
    public Task<IActionResult> Cancel(string id, [FromBody] OrderActionRequest? request) =>
        RunAction(id, (order, actor) => _actions.CancelAsync(order, actor, request?.Reason));

    [HttpPost("{id}/force-status")]
    public Task<IActionResult> ForceStatus(string id, [FromBody] ForceStatusRequest request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Status))
        {
            return Task.FromResult<IActionResult>(BadRequest(new { message = "Status is required." }));
        }
        return RunAction(id, (order, actor) => _actions.ForceStatusAsync(order, actor, request.Status, request.Reason ?? string.Empty));
    }

    /// <summary>
    /// Старый маршрут смены статуса. Оставлен, чтобы не ломать открытые вкладки, но ведёт
    /// на ForceStatus: без причины теперь не сработает.
    /// </summary>
    [HttpPatch("{id}/status")]
    public Task<IActionResult> UpdateStatus(string id, [FromBody] UpdateOrderStatusRequest request) =>
        ForceStatus(id, new ForceStatusRequest { Status = request?.Status ?? string.Empty, Reason = request?.Note });

    private async Task<IActionResult> RunAction(string id, Func<Order, string, Task<ActionOutcome>> action)
    {
        var order = await _orderRepository.GetOrderByIdAsync(id);
        if (order == null)
        {
            return NotFound();
        }

        var actor = SupportUserContext.FromClaims(User).Email;
        var outcome = await action(order, actor);

        var fresh = await _orderRepository.GetOrderByIdAsync(id) ?? order;
        var mapped = (await MapOrdersAsync(new[] { fresh })).First();
        var body = new { ok = outcome.Success, message = outcome.Message, order = mapped };
        return outcome.Success ? Ok(body) : StatusCode(outcome.StatusCode, body);
    }

    // ---------- маппинг ----------

    private static OrderQueryParameters BuildQuery(string search, string status, string paymentStatus, DateTime? from, DateTime? to, int page, int pageSize, string sort) =>
        new()
        {
            Search = search,
            Status = status,
            PaymentStatus = paymentStatus,
            DateFrom = from,
            DateTo = to,
            Page = page,
            PageSize = pageSize,
            Sort = sort
        };

    private async Task<List<AdminOrderDto>> MapOrdersAsync(IEnumerable<Order> orders)
    {
        var orderList = orders.ToList();

        // Названия игр для легаси-заказов без позиций: у них есть только GameId.
        var gameIds = orderList
            .SelectMany(order => NormalizedItems(order).Select(i => i.GameId).Append(order.GameId))
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();
        var games = gameIds.Count > 0 ? await _gameRepository.GetByIdsAsync(gameIds) : new List<Game>();
        var gameLookup = games.Where(g => g.Id != null).ToDictionary(game => game.Id!, StringComparer.OrdinalIgnoreCase);

        return orderList.Select(order =>
        {
            var items = NormalizedItems(order).Select(item =>
            {
                gameLookup.TryGetValue(item.GameId ?? string.Empty, out var game);
                var delivered = item.Delivery?.Keys ?? new List<DeliveredKey>();
                var needed = Math.Max(1, item.Quantity);
                return new AdminOrderItemDto
                {
                    GameId = item.GameId ?? string.Empty,
                    Title = string.IsNullOrWhiteSpace(item.Title) ? (game?.Title ?? game?.Name ?? order.GameName) : item.Title,
                    Price = item.FinalUnitPrice != 0 ? item.FinalUnitPrice : item.UnitPrice,
                    Qty = needed,
                    KeysDelivered = delivered.Count,
                    KeysNeeded = needed,
                    KeyMasks = delivered.Select(k => k.KeyMasked ?? string.Empty).Where(k => k.Length > 0).ToList(),
                    KeyDeliveryStatus = delivered.Count >= needed ? "SENT" : delivered.Count > 0 ? "PARTIAL" : "NOT_SENT"
                };
            }).ToList();

            return new AdminOrderDto
            {
                Id = order.Id.ToString(),
                // Номер заказа — то, что видит клиент в письме; раньше сюда шёл внутренний GUID.
                Number = string.IsNullOrWhiteSpace(order.OrderNumber) ? order.Id.ToString() : order.OrderNumber,
                UserId = order.UserId,
                UserEmail = order.UserId.Contains('@') ? order.UserId : null,
                Status = ResolveStatus(order),
                PaymentStatus = ResolvePaymentStatus(order),
                FulfillmentStatus = ResolveFulfillmentStatus(order),
                TotalAmount = ResolveTotal(order),
                Currency = string.IsNullOrWhiteSpace(order.Currency) ? "USD" : order.Currency,
                Items = items,
                CreatedAt = order.OrderDate.ToUniversalTime().ToString("O"),
                UpdatedAt = (order.UpdatedAt ?? order.OrderDate).ToUniversalTime().ToString("O"),
                PaidAt = order.PaidAt?.ToUniversalTime().ToString("O"),
                Payment = new AdminOrderPaymentDto
                {
                    Provider = order.PaymentProvider,
                    TransactionId = order.PaymentIntentId,
                    Method = order.PaymentProvider
                },
                RequiresDeliveryVerification = order.RequiresDeliveryVerification,
                Notes = order.Notes,
                PromoCode = order.PromoCode,
                Events = (order.Events ?? new List<OrderEvent>())
                    .OrderBy(e => e.CreatedAt)
                    .Select(e => new AdminOrderEventDto
                    {
                        Type = e.Type,
                        Message = e.Message,
                        Actor = e.Actor,
                        CreatedAt = e.CreatedAt.ToUniversalTime().ToString("O")
                    })
                    .ToList()
            };
        }).ToList();
    }

    private static List<OrderItemSnapshot> NormalizedItems(Order order)
    {
        var items = order.Items ?? new List<OrderItemSnapshot>();
        if (items.Count > 0)
        {
            return items;
        }
        if (string.IsNullOrWhiteSpace(order.GameId))
        {
            return items;
        }
        // Легаси-заказ без позиций — одна позиция из полей заказа.
        return new List<OrderItemSnapshot>
        {
            new() { GameId = order.GameId, Title = order.GameName, Quantity = 1, UnitPrice = order.TotalAmount ?? 0, FinalUnitPrice = order.TotalAmount ?? 0 }
        };
    }

    private static decimal ResolveTotal(Order order) =>
        order.Totals?.Total > 0 ? order.Totals.Total : order.TotalAmount ?? 0m;

    private static string ResolveStatus(Order order)
    {
        if (!string.IsNullOrWhiteSpace(order.Status))
        {
            return order.Status.ToUpperInvariant();
        }
        if (!order.IsPaid)
        {
            return "PENDING";
        }
        return order.IsFulfilled ? "DELIVERED" : "PROCESSING";
    }

    private static string ResolvePaymentStatus(Order order)
    {
        if (!string.IsNullOrWhiteSpace(order.PaymentStatus))
        {
            return order.PaymentStatus.ToUpperInvariant();
        }
        return order.IsPaid ? "PAID" : "UNPAID";
    }

    private static string ResolveFulfillmentStatus(Order order)
    {
        if (!string.IsNullOrWhiteSpace(order.FulfillmentStatus))
        {
            return order.FulfillmentStatus.ToUpperInvariant();
        }
        return order.IsFulfilled ? "DELIVERED" : "NOT_STARTED";
    }

    private static string Csv(string? value)
    {
        var text = value ?? string.Empty;
        return text.IndexOfAny(new[] { ',', '"', '\n', '\r' }) >= 0
            ? "\"" + text.Replace("\"", "\"\"") + "\""
            : text;
    }
}

public class UpdateOrderStatusRequest
{
    public string Status { get; set; } = string.Empty;
    public string? Note { get; set; }
}

public class OrderActionRequest
{
    public string? Reason { get; set; }
}

public class ForceStatusRequest
{
    public string Status { get; set; } = string.Empty;
    public string? Reason { get; set; }
}

public class AdminOrderDto
{
    public string Id { get; set; } = string.Empty;
    public string Number { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string? UserEmail { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? PaymentStatus { get; set; }
    public string? FulfillmentStatus { get; set; }
    public decimal TotalAmount { get; set; }
    public string Currency { get; set; } = "USD";
    public List<AdminOrderItemDto> Items { get; set; } = new();
    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
    public string? PaidAt { get; set; }
    public AdminOrderPaymentDto? Payment { get; set; }
    public bool RequiresDeliveryVerification { get; set; }
    public string? Notes { get; set; }
    public string? PromoCode { get; set; }
    public List<AdminOrderEventDto> Events { get; set; } = new();
}

public class AdminOrderItemDto
{
    public string GameId { get; set; } = string.Empty;
    public string? Title { get; set; }
    public decimal Price { get; set; }
    public int Qty { get; set; }
    public int KeysDelivered { get; set; }
    public int KeysNeeded { get; set; }
    public List<string> KeyMasks { get; set; } = new();
    /// <summary>SENT | PARTIAL | NOT_SENT</summary>
    public string? KeyDeliveryStatus { get; set; }
}

public class AdminOrderPaymentDto
{
    public string? Provider { get; set; }
    public string? TransactionId { get; set; }
    public string? Method { get; set; }
}

public class AdminOrderEventDto
{
    public string Type { get; set; } = string.Empty;
    public string? Message { get; set; }
    public string? Actor { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
}
