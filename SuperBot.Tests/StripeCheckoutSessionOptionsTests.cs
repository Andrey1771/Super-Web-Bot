using SuperBot.Infrastructure.Services;
using Xunit;

namespace SuperBot.Tests;

/// <summary>
/// Сессия покупателя Stripe для формы карты на кассе. Карта, добавленная в кабинете (Billing → Add method), не появлялась
/// на кассе: Stripe помечает такие карты allow_redisplay = unspecified, а фильтр показа по умолчанию — только "always".
/// </summary>
public class StripeCheckoutSessionOptionsTests
{
    [Fact]
    public void Checkout_session_shows_cards_saved_from_the_billing_page_too()
    {
        var options = StripeCustomerGateway.CheckoutSessionOptions("cus_123");
        var features = options.Components.PaymentElement.Features;

        Assert.Equal("cus_123", options.Customer);
        Assert.True(options.Components.PaymentElement.Enabled);
        Assert.Equal("enabled", features.PaymentMethodRedisplay);
        Assert.Contains("always", features.PaymentMethodAllowRedisplayFilters);
        Assert.Contains("unspecified", features.PaymentMethodAllowRedisplayFilters);
    }

    [Fact]
    public void Checkout_session_offers_saving_for_on_session_use_only_and_keeps_removal_in_billing()
    {
        var features = StripeCustomerGateway.CheckoutSessionOptions("cus_123").Components.PaymentElement.Features;

        Assert.Equal("enabled", features.PaymentMethodSave);       // галочка «сохранить», по умолчанию снята на стороне Stripe
        Assert.Equal("on_session", features.PaymentMethodSaveUsage); // списаний без покупателя не будет
        Assert.Equal("disabled", features.PaymentMethodRemove);     // удалять карты — в кабинете
    }
}
