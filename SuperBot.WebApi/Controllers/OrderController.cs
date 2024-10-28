using AutoMapper;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class OrderController(IOrderRepository _orderRepository, IMapper _mapper) : Controller
    {
        [HttpPost("{orderId}")]
        public async Task<IActionResult> SetPaidSteamOrder(string id)
        {
            var order = await _orderRepository.GetOrderByIdAsync(id);
            if (order == null)
            {
                return NotFound();
            }

            order.IsPaid = true;

            await _orderRepository.UpdateOrderAsync(order);
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

    }
}
