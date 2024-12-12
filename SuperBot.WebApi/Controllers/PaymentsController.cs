using Microsoft.AspNetCore.Mvc;
using Stripe;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PaymentsController : ControllerBase
    {
        [HttpPost("create-payment-intent")]
        public ActionResult CreatePaymentIntent([FromBody] CreatePaymentIntentRequest request)
        {
            var options = new PaymentIntentCreateOptions
            {
                Amount = request.Amount,
                Currency = "usd",
                PaymentMethodTypes = new List<string> { "card" },
            };

            var service = new PaymentIntentService();
            var paymentIntent = service.Create(options);

            return Ok(new { ClientSecret = paymentIntent.ClientSecret });
        }
    }

    public class CreatePaymentIntentRequest
    {
        public long Amount { get; set; }
    }
}
