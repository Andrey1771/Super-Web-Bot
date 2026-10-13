using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IBotStateService
{
    public interface IBotStateWriterService
    {
        public Task SaveChatStateAsync(long chatId, ChatState state);
    }
}
