using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Types;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/account/orders")]
    [Authorize]
    public class AccountOrdersController : ControllerBase
    {
        private const string DefaultCurrency = "USD";
        private const int MaxPageSize = 100;

        private readonly IOrderRepository _orderRepository;
        private readonly IGameRepository _gameRepository;

        public AccountOrdersController(IOrderRepository orderRepository, IGameRepository gameRepository)
        {
            _orderRepository = orderRepository;
            _gameRepository = gameRepository;
        }

        [HttpGet]
        public async Task<ActionResult<AccountOrdersResponse>> GetOrders(
            [FromQuery] string q,
            [FromQuery] string status,
            [FromQuery] string sort = "newest",
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 12)
        {
            var userName = GetUserName();
            if (string.IsNullOrWhiteSpace(userName))
            {
                return Unauthorized();
            }

            var normalizedPage = page < 1 ? 1 : page;
            var normalizedPageSize = pageSize < 1 ? 12 : Math.Min(pageSize, MaxPageSize);

            var orders = (await _orderRepository.GetAllOrdersAsync())
                .Where(order => string.Equals(order.UserName, userName, StringComparison.OrdinalIgnoreCase))
                .ToList();

            var games = await _gameRepository.GetAllAsync();
            var gameById = games.Where(g => !string.IsNullOrWhiteSpace(g.Id)).ToDictionary(g => g.Id, g => g);
            var gameByName = games.Where(g => !string.IsNullOrWhiteSpace(g.Name)).ToDictionary(g => g.Name, g => g, StringComparer.OrdinalIgnoreCase);

            if (!string.IsNullOrWhiteSpace(status))
            {
                var normalizedStatus = status.Trim();
                orders = orders
                    .Where(order => string.Equals(GetOrderStatus(order), normalizedStatus, StringComparison.OrdinalIgnoreCase))
                    .ToList();
            }

            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                orders = orders
                    .Where(order =>
                    {
                        var statusLabel = GetOrderStatus(order);
                        var orderId = order.Id.ToString();
                        var gameName = order.GameName ?? string.Empty;
                        return ContainsInvariant(orderId, term)
                               || ContainsInvariant(gameName, term)
                               || ContainsInvariant(statusLabel, term);
                    })
                    .ToList();
            }

            orders = sort switch
            {
                "oldest" => orders.OrderBy(order => order.OrderDate).ToList(),
                "amount_desc" => orders.OrderByDescending(order => GetOrderTotal(order, gameById, gameByName)).ToList(),
                "amount_asc" => orders.OrderBy(order => GetOrderTotal(order, gameById, gameByName)).ToList(),
                _ => orders.OrderByDescending(order => order.OrderDate).ToList()
            };

            var totalCount = orders.Count;
            var pagedOrders = orders
                .Skip((normalizedPage - 1) * normalizedPageSize)
                .Take(normalizedPageSize)
                .ToList();

            var response = new AccountOrdersResponse
            {
                Page = normalizedPage,
                PageSize = normalizedPageSize,
                Total = totalCount,
                Items = pagedOrders.Select(order => BuildOrderDto(order, gameById, gameByName)).ToList()
            };

            return Ok(response);
        }

        [HttpGet("{orderId}/invoice")]
        public async Task<IActionResult> GetInvoice(string orderId)
        {
            var userName = GetUserName();
            if (string.IsNullOrWhiteSpace(userName))
            {
                return Unauthorized();
            }

            var order = await _orderRepository.GetOrderByIdAsync(orderId);
            if (order == null || !string.Equals(order.UserName, userName, StringComparison.OrdinalIgnoreCase))
            {
                return NotFound();
            }

            if (!order.IsPaid)
            {
                return NotFound();
            }

            var games = await _gameRepository.GetAllAsync();
            var gameById = games.Where(g => !string.IsNullOrWhiteSpace(g.Id)).ToDictionary(g => g.Id, g => g);
            var gameByName = games.Where(g => !string.IsNullOrWhiteSpace(g.Name)).ToDictionary(g => g.Name, g => g, StringComparer.OrdinalIgnoreCase);
            var total = GetOrderTotal(order, gameById, gameByName);

            var pdfBytes = BuildInvoicePdf(order, total);
            var fileName = $"invoice-{order.Id}.pdf";

            return File(pdfBytes, "application/pdf", fileName);
        }

        private string GetUserName()
        {
            return User.FindFirst("preferred_username")?.Value
                   ?? User.FindFirst(ClaimTypes.Name)?.Value
                   ?? User.Identity?.Name
                   ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        }

        private static bool ContainsInvariant(string value, string term)
        {
            return value?.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static string GetOrderStatus(Order order)
        {
            return order.IsPaid ? "Completed" : "Processing";
        }

        private static decimal GetOrderTotal(Order order, IReadOnlyDictionary<string, Game> gamesById, IReadOnlyDictionary<string, Game> gamesByName)
        {
            var game = GetOrderGame(order, gamesById, gamesByName);
            return game?.Price ?? 0m;
        }

        private static Game GetOrderGame(Order order, IReadOnlyDictionary<string, Game> gamesById, IReadOnlyDictionary<string, Game> gamesByName)
        {
            if (!string.IsNullOrWhiteSpace(order.GameId) && gamesById.TryGetValue(order.GameId, out var byId))
            {
                return byId;
            }

            if (!string.IsNullOrWhiteSpace(order.GameName) && gamesByName.TryGetValue(order.GameName, out var byName))
            {
                return byName;
            }

            return null;
        }

        private static AccountOrderDto BuildOrderDto(Order order, IReadOnlyDictionary<string, Game> gamesById, IReadOnlyDictionary<string, Game> gamesByName)
        {
            var game = GetOrderGame(order, gamesById, gamesByName);
            var status = GetOrderStatus(order);
            var total = game?.Price ?? 0m;
            var hasInvoice = order.IsPaid;
            var keysAvailable = order.IsPaid;
            var keysCount = order.IsPaid ? 1 : 0;

            return new AccountOrderDto
            {
                OrderId = order.Id.ToString(),
                CreatedAt = order.OrderDate,
                Status = status,
                Currency = DefaultCurrency,
                Total = total,
                Items = new List<AccountOrderItemDto>
                {
                    new AccountOrderItemDto
                    {
                        GameId = game?.Id ?? order.GameId,
                        Title = game?.Title ?? order.GameName,
                        CoverUrl = game?.ImagePath,
                        Qty = 1
                    }
                },
                HasInvoice = hasInvoice,
                InvoiceId = hasInvoice ? $"inv_{order.Id}" : null,
                KeysAvailable = keysAvailable,
                KeysCount = keysCount
            };
        }

        private static byte[] BuildInvoicePdf(Order order, decimal total)
        {
            var content = new StringBuilder();
            content.AppendLine("BT");
            content.AppendLine("/F1 20 Tf");
            content.AppendLine("50 750 Td");
            content.AppendLine($"(Invoice for Order {order.Id}) Tj");
            content.AppendLine("0 -30 Td");
            content.AppendLine($"/F1 12 Tf");
            content.AppendLine($"(Date: {order.OrderDate.ToString("D", CultureInfo.InvariantCulture)}) Tj");
            content.AppendLine("0 -20 Td");
            content.AppendLine($"(Game: {EscapePdfText(order.GameName)}) Tj");
            content.AppendLine("0 -20 Td");
            content.AppendLine($"(Total: {total.ToString("F2", CultureInfo.InvariantCulture)} {DefaultCurrency}) Tj");
            content.AppendLine("ET");

            var contentBytes = Encoding.ASCII.GetBytes(content.ToString());
            var objects = new List<string>
            {
                "<< /Type /Catalog /Pages 2 0 R >>",
                "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
                $"<< /Length {contentBytes.Length} >>\nstream\n{content}\nendstream",
                "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
            };

            var offsets = new List<int> { 0 };
            var builder = new StringBuilder();
            builder.AppendLine("%PDF-1.4");

            for (var i = 0; i < objects.Count; i++)
            {
                offsets.Add(builder.Length);
                builder.AppendLine($"{i + 1} 0 obj");
                builder.AppendLine(objects[i]);
                builder.AppendLine("endobj");
            }

            var xrefPosition = builder.Length;
            builder.AppendLine("xref");
            builder.AppendLine($"0 {objects.Count + 1}");
            builder.AppendLine("0000000000 65535 f ");

            for (var i = 1; i < offsets.Count; i++)
            {
                builder.AppendLine($"{offsets[i].ToString("D10", CultureInfo.InvariantCulture)} 00000 n ");
            }

            builder.AppendLine("trailer");
            builder.AppendLine($"<< /Size {objects.Count + 1} /Root 1 0 R >>");
            builder.AppendLine("startxref");
            builder.AppendLine(xrefPosition.ToString(CultureInfo.InvariantCulture));
            builder.AppendLine("%%EOF");

            return Encoding.ASCII.GetBytes(builder.ToString());
        }

        private static string EscapePdfText(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            return value
                .Replace("\\", "\\\\")
                .Replace("(", "\\(")
                .Replace(")", "\\)");
        }
    }
}
