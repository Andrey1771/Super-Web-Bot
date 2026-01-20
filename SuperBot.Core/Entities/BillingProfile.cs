namespace SuperBot.Core.Entities
{
    public class BillingProfile
    {
        public string UserId { get; set; }
        public string StripeCustomerId { get; set; }
        public string DisplayName { get; set; }
        public string Email { get; set; }
        public BillingDetails BillingDetails { get; set; }
        public bool HideOwnedGamesInProfile { get; set; }
        public string DefaultPaymentMethodId { get; set; }
    }

    public class BillingDetails
    {
        public string AddressLine1 { get; set; }
        public string City { get; set; }
        public string PostalCode { get; set; }
        public string Country { get; set; }
        public string Phone { get; set; }
    }
}
