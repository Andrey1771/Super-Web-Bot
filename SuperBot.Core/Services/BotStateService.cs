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
            var state = _chatStates.FirstOrDefault(chatState => chatState.Key == chatId).Value;
            // Если состояния для пользователя нет, возвращаем новое
            if (state == null)
            {
                state = new ChatState { LastInteractionTime = DateTime.UtcNow, DialogState = DialogState.MainMenu };
                //_chatStates[chatId] = state;
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
