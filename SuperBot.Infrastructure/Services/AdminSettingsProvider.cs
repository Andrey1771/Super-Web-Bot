using Microsoft.Extensions.Configuration;
using SuperBot.Core.Interfaces;

namespace SuperBot.Infrastructure.Services
{
    public class AdminSettingsProvider : IAdminSettingsProvider
    {
        private readonly string _username;
        private readonly int _commissionRate;
        private readonly long _adminChatId;

        public AdminSettingsProvider(IConfiguration configuration)
        {
            _username = configuration["TelegramUsername"] ?? string.Empty;
            // Устойчивый разбор: пустой/неверный конфиг не должен ронять запуск сервиса.
            _commissionRate = int.TryParse(configuration["CommissionRate"], out var rate) ? rate : 0;
            _adminChatId = long.TryParse(configuration["AdminChatId"], out var chatId) ? chatId : 0;
        }

        public string Username => _username;

        public long AdminChatId => _adminChatId;

        public int CommissionRate => _commissionRate;
    }
}
