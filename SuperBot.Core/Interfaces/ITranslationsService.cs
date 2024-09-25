using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces
{
    public interface ITranslationsService
    {
        LanguageTranslation Translation { get; }
        KeyboardKeys KeyboardKeys { get; }
    }
}
