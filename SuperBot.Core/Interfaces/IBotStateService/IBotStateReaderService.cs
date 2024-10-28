using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IBotStateService
{
    public interface IBotStateReaderService
    {
        Task<ChatState> GetChatStateAsync(long chatId);
    }
}
