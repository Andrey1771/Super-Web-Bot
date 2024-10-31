namespace SuperBot.Core.Interfaces
{
    public interface IPayService
    {
        Task<(string Id, string ConfirmationUrl)> CreatePaymentAsync(decimal amount, string currency, string description, string returnUrl, string orderId);
        Task<string> CreatePayoutAsync(decimal amount, string currency, string destinationType, string destination);
    }
}
