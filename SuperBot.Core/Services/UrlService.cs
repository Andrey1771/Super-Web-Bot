using SuperBot.Core.Interfaces;

namespace SuperBot.Core.Services
{
    public class UrlService(IResourceService _resourceService) : IUrlService
    {
        public string MainUrl => _resourceService.Resources.MainUrl;
    }
}
