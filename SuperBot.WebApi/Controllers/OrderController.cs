using SuperBot.Infrastructure.Mapping;
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;
using SuperBot.Infrastructure.Data;
using SuperBot.Core.Interfaces;

namespace SuperBot.WebApi.Controllers
{
    // Легаси/админские операции над заказами. Реальный покупательский чекаут идёт через
    // PaymentsController (Stripe) — сюда покупатели не ходят, поэтому весь контроллер только для админа.
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "admin")]
    public class OrderController(
        IOrderRepository _orderRepository,
        IGameRepository _gameRepository,
        IMapper _mapper,
        IPromoCodeService _promoCodeService,
        IKeyFulfillmentService _keyFulfillmentService) : Controller
    {

        // GET: api/order/summary
        [HttpGet("summary")]
        public async Task<ActionResult<IEnumerable<OrderSummaryDto>>> GetOrderSummaries()
        {
            var orders = (await _orderRepository.GetAllOrdersAsync()).ToList();
            var gameIds = orders
                .Select(order => order.GameId)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Distinct()
                .ToList();

            var games = gameIds.Count > 0
                ? await _gameRepository.GetByIdsAsync(gameIds)
                : new List<Game>();

            var gameLookup = games.ToDictionary(game => game.Id, StringComparer.OrdinalIgnoreCase);

            var summaries = orders.Select(order =>
            {
                gameLookup.TryGetValue(order.GameId ?? string.Empty, out var game);
                var totalAmount = game?.Price ?? 0m;

                return new OrderSummaryDto
                {
                    Id = order.Id,
                    GameId = order.GameId,
                    GameName = string.IsNullOrWhiteSpace(order.GameName) ? game?.Name : order.GameName,
                    UserName = order.UserName,
                    IsPaid = order.IsPaid,
                    IsFulfilled = order.IsFulfilled,
                    OrderDate = order.OrderDate,
                    TotalAmount = totalAmount,
                    Currency = "USD",
                    Status = ResolveStatus(order)
                };
            });

            return Ok(summaries);
        }

        private static string ResolveStatus(Order order)
        {
            if (!order.IsPaid)
            {
                return "Payment pending";
            }

            if (!order.IsFulfilled)
            {
                return "Processing";
            }

            return "Completed";
        }
    }

    public class OrderSummaryDto
    {
        public Guid Id { get; set; }
        public string GameId { get; set; }
        public string GameName { get; set; }
        public string UserName { get; set; }
        public bool IsPaid { get; set; }
        public bool IsFulfilled { get; set; }
        public DateTime OrderDate { get; set; }
        public decimal TotalAmount { get; set; }
        public string Currency { get; set; }
        public string Status { get; set; }
    }
}
