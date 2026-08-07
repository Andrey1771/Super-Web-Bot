using AutoMapper;
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
        // GET: api/order/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<Order>> GetOrderById(string id)
        {
            var order = await _orderRepository.GetOrderByIdAsync(id);
            if (order == null)
            {
                return NotFound();
            }

            return Ok(_mapper.Map<Order>(order));
        }

        // GET: api/order
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Order>>> GetAllOrders()
        {
            var orders = await _orderRepository.GetAllOrdersAsync();
            var orderDtos = _mapper.Map<IEnumerable<Order>>(orders);

            return Ok(orderDtos);
        }

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

        // POST: api/order
        [HttpPost]
        public async Task<ActionResult> CreateOrder([FromBody] Order orderDto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var order = _mapper.Map<Order>(orderDto);
            order.OrderDate = order.OrderDate == default ? DateTime.UtcNow : order.OrderDate;

            // Путь легаси/админский, но правило общее с чекаутом: невышедшую игру продать нельзя.
            var orderGameIds = order.Items
                .Select(item => item.GameId)
                .Append(order.GameId)
                .Where(gameId => !string.IsNullOrWhiteSpace(gameId))
                .Select(gameId => gameId!)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (orderGameIds.Count > 0)
            {
                var utcNow = DateTime.UtcNow;
                var orderGames = await _gameRepository.GetByIdsAsync(orderGameIds);
                var upcomingGame = orderGames.FirstOrDefault(game => GameRelease.IsUpcoming(game.ReleaseDate, utcNow));
                if (upcomingGame != null)
                {
                    var title = !string.IsNullOrWhiteSpace(upcomingGame.Title) ? upcomingGame.Title : upcomingGame.Name;
                    return BadRequest(new { message = $"“{title}” isn't released yet." });
                }
            }

            if (!string.IsNullOrWhiteSpace(order.PromoCode) && order.TotalAmount.HasValue)
            {
                var validation = await _promoCodeService.ValidateAsync(new PromoValidationRequest
                {
                    Code = order.PromoCode,
                    CartSubtotal = order.TotalAmount.Value,
                    UserName = order.UserName
                });

                if (!validation.Valid)
                {
                    return BadRequest(new { message = validation.Message });
                }

                order.PromoCode = validation.NormalizedCode;
                order.PromoDiscountAmount = validation.DiscountAmount;
                order.TotalAmount = validation.FinalTotal;
            }

            await _orderRepository.CreateOrderAsync(order);

            // Выдача ключей по позициям заказа: из пула инвентаря.
            // (В реальном prod-флоу логичнее звать это на подтверждении оплаты, см. IKeyFulfillmentService.)
            await _keyFulfillmentService.FulfillOrderAsync(order);

            if (!string.IsNullOrWhiteSpace(order.PromoCode) && order.TotalAmount.HasValue)
            {
                await _promoCodeService.RecordUsageAsync(new PromoApplyRequest
                {
                    Code = order.PromoCode,
                    CartSubtotal = order.TotalAmount.Value + (order.PromoDiscountAmount ?? 0),
                    UserName = order.UserName,
                    OrderId = order.Id.ToString()
                });
            }

            return CreatedAtAction(nameof(GetOrderById), new { id = order.Id }, order);
        }

        // PUT: api/order/{id}
        [HttpPut("{id}")]
        public async Task<ActionResult> UpdateOrder(string id, [FromBody] Order orderDto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var order = await _orderRepository.GetOrderByIdAsync(id);
            if (order == null)
            {
                return NotFound();
            }

            var updatedOrder = _mapper.Map<Order>(orderDto);
            updatedOrder.Id = Guid.Parse(id); // Ensure the ID is the same

            await _orderRepository.UpdateOrderAsync(updatedOrder);

            return NoContent(); // Successful update, no content to return
        }

        // DELETE: api/order/{id}
        [HttpDelete("{id}")]
        public async Task<ActionResult> DeleteOrder(string id)
        {
            var order = await _orderRepository.GetOrderByIdAsync(id);
            if (order == null)
            {
                return NotFound();
            }

            await _orderRepository.DeleteOrderAsync(id);
            return NoContent(); // Successful delete
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
