using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.APIs;
using System;
using System.Net.Http.Json;

namespace SuperBot.Core.Services.APIs
{
    public class OrderApiClient(HttpClient _httpClient, IUrlService _urlService) : IOrderApiClient
    {
        public async Task<IEnumerable<Order>> GetAllOrdersAsync()
        {
            var response = await _httpClient.GetAsync($"{_urlService.MainUrl}/api/order");
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<IEnumerable<Order>>();
        }

        public async Task<IEnumerable<Order>> GetOrdersByUserNameAsync(string userName)
        {
            var response = await _httpClient.GetAsync($"{_urlService.MainUrl}/api/order/user/{Uri.EscapeDataString(userName)}");
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<IEnumerable<Order>>();
        }

        public async Task<Order> GetOrderByIdAsync(string id)
        {
            var response = await _httpClient.GetAsync($"{_urlService.MainUrl}/api/order/{id}");
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<Order>();
        }

        public async Task CreateOrderAsync(Order newOrder)
        {
            var response = await _httpClient.PostAsJsonAsync($"{_urlService.MainUrl}/api/order", newOrder);
            response.EnsureSuccessStatusCode();
        }

        public async Task UpdateOrderAsync(string id, Order updatedOrder)
        {
            var response = await _httpClient.PutAsJsonAsync($"{_urlService.MainUrl}/api/order/{id}", updatedOrder);
            response.EnsureSuccessStatusCode();
        }

        public async Task DeleteOrderAsync(string id)
        {
            var response = await _httpClient.DeleteAsync($"{_urlService.MainUrl}/api/order/{id}");
            response.EnsureSuccessStatusCode();
        }
    }
}
