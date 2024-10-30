namespace SuperBot.WebApi.Services
{
    public interface IAdminSettingsProvider
    {
        string Username { get; }
        int CommissionRate { get; }
        long AdminChatId { get; }
    }
}
