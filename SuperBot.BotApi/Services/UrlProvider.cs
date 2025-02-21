using SuperBot.Core.Interfaces;

namespace SuperBot.BotApi.Services
{
    public class UrlProvider : IUrlService
    {
        private readonly string _mainUrl;

        public UrlProvider(IConfiguration configuration)
        {
            _mainUrl = configuration["MainUrl"];
        }

        public string MainUrl => _mainUrl;
    }
}
