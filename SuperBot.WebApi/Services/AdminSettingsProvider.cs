namespace SuperBot.WebApi.Services
{
    public class AdminSettingsProvider : IAdminSettingsProvider
    {
        private readonly string _username;
        private readonly long _adminChatId;
        public AdminSettingsProvider(IConfiguration configuration)
        {
            _username = configuration["Username"];
            _adminChatId = long.Parse(configuration["AdminChatId"]);
        }

        public string Username => _username;

        public long AdminChatId => _adminChatId;
    }
}
