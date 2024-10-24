namespace SuperBot.Core.Interfaces
{
    public interface IPayService
    {
        Task<string> CreatePaymentAsync(decimal amount, string currency, string description, string returnUrl);
    }
}
