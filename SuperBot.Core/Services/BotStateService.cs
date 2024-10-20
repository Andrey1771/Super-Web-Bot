using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IBotStateService;
using System.Collections.Concurrent;

namespace SuperBot.Core.Services
{
    public class BotStateService : IBotStateReaderService, IBotStateWriterService
    {
        private readonly ConcurrentDictionary<long, ChatState> _chatStates = new ConcurrentDictionary<long, ChatState>();

        public Task<ChatState> GetChatStateAsync(long chatId)
        {
            // Если состояния для пользователя нет, возвращаем новое
            if (!_chatStates.TryGetValue(chatId, out var state))
            {
                state = new ChatState { LastInteractionTime = DateTime.UtcNow };
                _chatStates[chatId] = state;
            }
            return Task.FromResult(state);
        }

        public Task SaveChatStateAsync(long chatId, ChatState state)
        {
            _chatStates[chatId] = state;
            return Task.CompletedTask;
        }

        public Task ClearChatStateAsync(long chatId)
        {
            _chatStates.TryRemove(chatId, out _);
            return Task.CompletedTask;
        }
    }
}
