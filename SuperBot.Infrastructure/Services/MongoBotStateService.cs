using Microsoft.Extensions.Configuration;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IBotStateService;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>
    /// Состояние диалога бота в Mongo (а не в памяти процесса). Делает бот-сервис stateless:
    /// его можно запускать несколькими репликами за балансировщиком и перезапускать без потери диалогов.
    /// </summary>
    public class MongoBotStateService : IBotStateReaderService, IBotStateWriterService
    {
        private readonly IMongoCollection<BotChatStateDb> _states;

        public MongoBotStateService(IMongoClient mongoClient, IConfiguration configuration)
        {
            var databaseName = configuration.GetSection("ConnectionStrings:Name").Value;
            _states = mongoClient.GetDatabase(databaseName).GetCollection<BotChatStateDb>("BotChatStates");
        }

        public async Task<ChatState> GetChatStateAsync(long chatId)
        {
            var document = await _states.Find(item => item.Id == chatId).FirstOrDefaultAsync();
            if (document == null)
            {
                // Нет записи — новый диалог. Дефолт не персистим: сохранится при первом изменении состояния.
                return new ChatState { DialogState = DialogState.MainMenu, LastInteractionTime = DateTime.UtcNow };
            }

            return new ChatState { DialogState = document.DialogState, LastInteractionTime = document.LastInteractionTime };
        }

        public async Task SaveChatStateAsync(long chatId, ChatState state)
        {
            var document = new BotChatStateDb
            {
                Id = chatId,
                DialogState = state.DialogState,
                LastInteractionTime = state.LastInteractionTime == default ? DateTime.UtcNow : state.LastInteractionTime
            };

            await _states.ReplaceOneAsync(item => item.Id == chatId, document, new ReplaceOptions { IsUpsert = true });
        }

        public Task ClearChatStateAsync(long chatId) =>
            _states.DeleteOneAsync(item => item.Id == chatId);

        public class BotChatStateDb
        {
            [BsonId]
            public long Id { get; set; }
            [BsonRepresentation(MongoDB.Bson.BsonType.String)]
            public DialogState DialogState { get; set; }
            public DateTime LastInteractionTime { get; set; }
        }
    }
}
