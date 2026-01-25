using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/admin/orders")]
[Authorize(Roles = "admin")]
public class AdminOrdersController : ControllerBase
{
    private readonly IOrderRepository _orderRepository;
    private readonly IGameRepository _gameRepository;

    public AdminOrdersController(IOrderRepository orderRepository, IGameRepository gameRepository)
    {
        _orderRepository = orderRepository;
        _gameRepository = gameRepository;
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
        var query = new OrderQueryParameters
        {
            Search = search,
            Status = status,
            PaymentStatus = paymentStatus,
            DateFrom = dateFrom,
            DateTo = dateTo,
            Page = page,
            PageSize = pageSize,
            Sort = sort
        };

        var (items, total) = await _orderRepository.GetPagedAsync(query);
        var mapped = await MapOrdersAsync(items);
        return Ok(new { items = mapped, total });
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

    [HttpPatch("{id}/status")]
    public async Task<IActionResult> UpdateStatus(string id, [FromBody] UpdateOrderStatusRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Status))
        {
            return BadRequest("Status is required.");
        }

        var order = await _orderRepository.GetOrderByIdAsync(id);
        if (order == null)
        {
            return NotFound();
        }

        var normalizedStatus = request.Status.Trim().ToUpperInvariant();
        ApplyStatus(order, normalizedStatus);

        order.Notes = string.IsNullOrWhiteSpace(request.Note) ? order.Notes : request.Note;
        order.UpdatedAt = DateTime.UtcNow;

        await _orderRepository.UpdateOrderAsync(order);
        var mapped = (await MapOrdersAsync(new[] { order })).First();
        return Ok(mapped);
    }

    private async Task<List<AdminOrderDto>> MapOrdersAsync(IEnumerable<Order> orders)
    {
        var orderList = orders.ToList();
        var gameIds = orderList
            .Select(order => order.GameId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();

        var games = gameIds.Count > 0
            ? await _gameRepository.GetByIdsAsync(gameIds)
            : new List<Game>();

        var gameLookup = games.ToDictionary(game => game.Id, StringComparer.OrdinalIgnoreCase);

        return orderList.Select(order =>
        {
            gameLookup.TryGetValue(order.GameId ?? string.Empty, out var game);
            var totalAmount = order.TotalAmount ?? game?.Price ?? 0m;
            var currency = string.IsNullOrWhiteSpace(order.Currency) ? "USD" : order.Currency;
            var status = ResolveStatus(order);
            var payment = ResolvePaymentStatus(order);
            var fulfillment = ResolveFulfillmentStatus(order);

            return new AdminOrderDto
            {
                Id = order.Id.ToString(),
                Number = order.Id.ToString(),
                UserId = order.UserName,
                UserEmail = order.UserName,
                Status = status,
                PaymentStatus = payment,
                FulfillmentStatus = fulfillment,
                TotalAmount = totalAmount,
                Currency = currency,
                Items = new List<AdminOrderItemDto>
                {
                    new()
                    {
                        GameId = order.GameId,
                        Title = string.IsNullOrWhiteSpace(order.GameName) ? game?.Name : order.GameName,
                        Price = totalAmount,
                        Qty = 1
                    }
                },
                CreatedAt = order.OrderDate.ToUniversalTime().ToString("O"),
                UpdatedAt = (order.UpdatedAt ?? order.OrderDate).ToUniversalTime().ToString("O"),
                Notes = order.Notes
            };
        }).ToList();
    }

    private static void ApplyStatus(Order order, string status)
    {
        order.Status = status;
        order.PaymentStatus = status switch
        {
            "PAID" => "PAID",
            "PROCESSING" => "PAID",
            "DELIVERED" => "PAID",
            "REFUNDED" => "REFUNDED",
            "FAILED" => "FAILED",
            _ => "UNPAID"
        };

        order.FulfillmentStatus = status switch
        {
            "DELIVERED" => "DELIVERED",
            "PROCESSING" => "IN_PROGRESS",
            "CANCELLED" => "CANCELLED",
            _ => "NOT_STARTED"
        };

        order.IsPaid = status is "PAID" or "PROCESSING" or "DELIVERED";
        order.IsFulfilled = status == "DELIVERED";
    }

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
}

public class UpdateOrderStatusRequest
{
    public string Status { get; set; }
    public string? Note { get; set; }
}

public class AdminOrderDto
{
    public string Id { get; set; }
    public string Number { get; set; }
    public string UserId { get; set; }
    public string? UserEmail { get; set; }
    public string Status { get; set; }
    public string? PaymentStatus { get; set; }
    public string? FulfillmentStatus { get; set; }
    public decimal TotalAmount { get; set; }
    public string Currency { get; set; }
    public List<AdminOrderItemDto> Items { get; set; } = new();
    public string CreatedAt { get; set; }
    public string UpdatedAt { get; set; }
    public AdminOrderPaymentDto? Payment { get; set; }
    public AdminOrderDeliveryDto? Delivery { get; set; }
    public string? Notes { get; set; }
}

public class AdminOrderItemDto
{
    public string GameId { get; set; }
    public string Title { get; set; }
    public decimal Price { get; set; }
    public int Qty { get; set; }
    public string? KeyDeliveryStatus { get; set; }
    public string? KeyValue { get; set; }
}

public class AdminOrderPaymentDto
{
    public string? Provider { get; set; }
    public string? TransactionId { get; set; }
    public string? Method { get; set; }
}

public class AdminOrderDeliveryDto
{
    public string? Type { get; set; }
    public string? Details { get; set; }
}
