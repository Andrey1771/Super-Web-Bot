namespace SuperBot.WebApi.Services
{
    public interface IAdminSettingsProvider
    {
        string Username { get; }
        long AdminChatId { get; }
    }
}
