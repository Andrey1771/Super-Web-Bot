using MediatR;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Application.Commands.TopUp;

namespace SuperBot.WebApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class YandexKassaWebhookController : ControllerBase
    {
        [HttpPost]
        public async Task<IActionResult> PaymentNotification([FromBody] YandexKassaWebhookData webhookData, IServiceProvider _serviceProvider, IMediator _mediator)
        {
            if (webhookData.Event == "payment.succeeded")
            {
                

                var paymentId = webhookData.Object.Id;
                var status = webhookData.Object.Status;

                var confirmTopUpSteamCommand = new ConfirmTopUpSteamCommand()
                {
                    PayId = webhookData.Object.Id
                };

                await _mediator.Send(confirmTopUpSteamCommand);

                return Ok();
            }
            else // TODO Обработать остальные варианты
            {
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
    }
}
