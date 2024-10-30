using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;

namespace SuperBot.Core.Services
{
    public class TranslationsService(IResourceService _resourceService) : ITranslationsService
    {
        public LanguageTranslation Translation
        {
            get
            {
                return _resourceService.Resources.Translations.Ru;
            }
        }

        public KeyboardKeys KeyboardKeys
        {
            get
            {
                return _resourceService.Resources.KeyboardKeys;
            }
        }
    }
}
