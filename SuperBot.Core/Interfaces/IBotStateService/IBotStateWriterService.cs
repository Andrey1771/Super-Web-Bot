using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IBotStateService
{
    public interface IBotStateWriterService
    {
        public Task SaveChatStateAsync(long userId, ChatState state);
        public Task ClearChatStateAsync(long userId);
    }
}
