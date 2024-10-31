using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Interfaces.IRepositories;
using System;

namespace SuperBot.WebApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class YandexKassaWebhookController : ControllerBase
    {
        [HttpPost]
        public async Task<IActionResult> PaymentNotification([FromBody] YandexKassaWebhookData webhookData, IServiceProvider _serviceProvider)
        {
            // Проверка типа события
            if (webhookData.Event == "payment.succeeded")
            {
                using var serviceScope = _serviceProvider.GetRequiredService<IServiceScopeFactory>().CreateScope();
                var steamOrderRepository = serviceScope.ServiceProvider.GetService(typeof(ISteamOrderRepository)) as ISteamOrderRepository;
                (await steamOrderRepository.GetAllOrdersAsync()).Select(order => order.PayId == webhookData.Object.Id);
                                // Получите ID платежа и статус
                                var paymentId = webhookData.Object.Id;
                var status = webhookData.Object.Status;

                // Обновите статус платежа в базе данных
                // Пример: UpdatePaymentStatus(paymentId, status);

                // Логгирование или любые другие действия
                Console.WriteLine($"Payment {paymentId} succeeded with status {status}.");

                // Верните ответ 200 OK для подтверждения получения
                return Ok();
            }
            else
            {
                // Если событие не обрабатывается, верните 200 OK, чтобы подтвердить, что запрос обработан
                Console.WriteLine("Unhandled event type: " + webhookData.Event);
                return Ok();
            }
        }
    }

    // Модель данных для получения JSON данных от ЮKassa
    public class YandexKassaWebhookData
    {
        public string Event { get; set; }
        public YandexKassaObject Object { get; set; }
    }

    public class YandexKassaObject
    {
        public string Id { get; set; }
        public string Status { get; set; }
        // Вы можете добавить другие поля в зависимости от того, какие данные вам нужны
    }
}
