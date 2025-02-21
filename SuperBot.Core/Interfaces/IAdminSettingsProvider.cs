namespace SuperBot.Core.Interfaces
{
    public interface IAdminSettingsProvider
    {
        string Username { get; }
        int CommissionRate { get; }
        long AdminChatId { get; }
    }
}
