using MongoDB.Bson.IO;
using System.Text;
using System.Text.Json;

namespace SuperBot.Infrastructure.ExternalServices
{
    public class YooKassaService
    {
        private readonly string _shopId = "shopId 480101"; // Замените на ваш Shop ID
        private readonly string _secretKey = "test_LVSntgkuA9-hBJjYWWpFaXCS1db3sm-RW6OcHiZswO0"; // Замените на ваш Secret Key
        private readonly HttpClient _httpClient;

        public YooKassaService(HttpClient httpClient)
        {
            _httpClient = httpClient;
            _httpClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Basic",
                Convert.ToBase64String(Encoding.ASCII.GetBytes($"{_shopId}:{_secretKey}")));
        }

        public async Task<string> CreatePaymentAsync(decimal amount, string currency, string description, string returnUrl)
        {
            var paymentRequest = new
            {
                amount = new
                {
                    value = amount.ToString("F2"), // Сумма платежа, два знака после запятой
                    currency = currency // Валюта (например, "RUB")
                },
                confirmation = new
                {
                    type = "redirect",
                    return_url = returnUrl // URL, на который пользователь будет перенаправлен после оплаты
                },
                description = description // Описание платежа
            };

            var jsonRequest = JsonSerializer.Serialize(paymentRequest);
            var content = new StringContent(jsonRequest, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync("https://api.yookassa.ru/v3/payments", content);
            var jsonResponse = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                // Парсим ответ и возвращаем URL для оплаты
                dynamic result = JsonSerializer.Deserialize<dynamic>(jsonResponse);
                return result.confirmation.confirmation_url;
            }
            else
            {
                throw new Exception($"Ошибка при создании платежа: {jsonResponse}");
            }
        }
    }
}
