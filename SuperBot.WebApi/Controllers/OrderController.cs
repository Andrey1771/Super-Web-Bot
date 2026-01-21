using AutoMapper;
using System;
using System.Collections.Generic;
using System.Linq;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class OrderController(
        IOrderRepository _orderRepository,
        IGameRepository _gameRepository,
        IMapper _mapper,
        IMediator _mediator) : Controller
    {
        [HttpPost("confirm/{orderId}")]
        public async Task<IActionResult> SetPaidSteamOrder(string orderId)
        {
            var confirmTopUpSteamCommand = new ConfirmTopUpSteamCommand()
            {
                PayId = orderId
            };

            await _mediator.Send(confirmTopUpSteamCommand);
            
            return Ok();
        }


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
            await _orderRepository.CreateOrderAsync(order);

            return CreatedAtAction(nameof(GetOrderById), new { id = order.Id }, orderDto);
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
