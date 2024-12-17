using Microsoft.AspNetCore.Mvc;
using Stripe;
using Stripe.Checkout;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PaymentsController : ControllerBase
    {
        [HttpPost("create-payment-intent")]
        public ActionResult CreatePaymentIntent([FromBody] CreatePaymentIntentRequest request)
        {
            /*var options = new SessionCreateOptions
            {
                LineItems = new List<SessionLineItemOptions>
                {
                    new SessionLineItemOptions
                    {
                        PriceData = new SessionLineItemPriceDataOptions
                        {
                            UnitAmount = request.Amount * 100,
                            Currency = "USD",
                        },
                    },
                },
                Mode = "payment",
                SuccessUrl = "http://localhost:4242/success",
                CancelUrl = "http://localhost:4242/cancel",
            };*/

            var options = new PaymentIntentCreateOptions
            {
                Amount = request.Amount * 100, // Так как сумма идет в центах
                Currency = "USD",
                AutomaticPaymentMethods = new PaymentIntentAutomaticPaymentMethodsOptions
                {
                    Enabled = true,
                }
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
