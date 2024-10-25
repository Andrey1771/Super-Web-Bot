using SuperBot.Core.Interfaces;
using SuperBot.Infrastructure.Dtos;
using System.Text;
using System.Text.Json;

namespace SuperBot.Infrastructure.ExternalServices
{
    public class YooKassaService : IPayService
    {
        private readonly string _shopId = "480101"; // Замените на ваш Shop ID
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
                    value = amount, // Сумма платежа, два знака после запятой
                    currency = currency // Валюта (например, "RUB")
                },
                /*confirmation = new
                {
                    type = "redirect",
                    //return_url = returnUrl // URL, на который пользователь будет перенаправлен после оплаты
                },*/
                confirmation = new
                {
                    type = "redirect",
                    return_url = returnUrl,
                    confirmation_url = "https://yoomoney.ru/api-pages/v2/payment-confirm/epl?orderId=23d93cac-000f-5000-8000-126628f15141"
                },
            description = description // Описание платежа
            };

            var jsonRequest = JsonSerializer.Serialize(paymentRequest);
            var content = new StringContent(jsonRequest, Encoding.UTF8, "application/json");

            // Генерация уникального Idempotence-Key
            var idempotenceKey = Guid.NewGuid().ToString(); // Используем GUID для уникальности
            _httpClient.DefaultRequestHeaders.Add("Idempotence-Key", idempotenceKey);
            
            var response = await _httpClient.PostAsync("https://api.yookassa.ru/v3/payments", content);
            
            var jsonResponse = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                // Парсим ответ и возвращаем URL для оплаты
                var result = JsonSerializer.Deserialize<YooKassaPaymentResponseDto>(jsonResponse);
                return result.Confirmation.ConfirmationUrl;
                //return paymentRequest.confirmation.confirmation_url;
            }
            else
            {
                throw new Exception($"Ошибка при создании платежа: {jsonResponse}");
            }
        }

        public async Task<string> CreatePayoutAsync(decimal amount, string currency, string destinationType, string destination)
        {
            var payoutRequest = new
            {
                amount = new
                {
                    value = amount.ToString("F2"), // Сумма выплаты, два знака после запятой
                    currency = currency // Валюта (например, "RUB")
                },
                payout_destination_data = new
                {
                    type = destinationType, // Тип получателя, например "bank_card" или "yoo_money"
                    account_number = destination // Номер карты или кошелька получателя
                },
                description = "Вывод средств пользователю" // Описание выплаты
            };

            var jsonRequest = JsonSerializer.Serialize(payoutRequest);
            var content = new StringContent(jsonRequest, Encoding.UTF8, "application/json");

            // Генерация уникального Idempotence-Key
            var idempotenceKey = Guid.NewGuid().ToString();
            _httpClient.DefaultRequestHeaders.Add("Idempotence-Key", idempotenceKey);

            var response = await _httpClient.PostAsync("https://api.yookassa.ru/v3/payouts", content);
            var jsonResponse = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                dynamic result = JsonSerializer.Deserialize<dynamic>(jsonResponse);
                return $"Выплата успешно создана. Статус: {result.status}";
            }
            else
            {
                throw new Exception($"Ошибка при создании выплаты: {jsonResponse}");
            }
        }
    }
}
