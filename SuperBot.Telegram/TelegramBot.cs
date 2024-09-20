using System.Net.Http.Json;

namespace SuperBot.Telegram
{
    public class TelegramBot
    {
        private readonly HttpClient _httpClient;
        private const string BusinessApiUrl = "https://business-service/api";
        private const string LocalizationApiUrl = "https://localization-service/api";

        public async Task HandleMessage(TelegramMessage message)
        {
            // Отправляем запрос в бизнес-логический сервис
            var businessResponse = await _httpClient.PostAsJsonAsync($"{BusinessApiUrl}/process", message);
            var businessResult = await businessResponse.Content.ReadAsStringAsync();

            // Получаем локализованное сообщение
            var localizationResponse = await _httpClient.GetAsync($"{LocalizationApiUrl}/translate?lang={message.From.LanguageCode}&key=Greeting");
            var localizedGreeting = await localizationResponse.Content.ReadAsStringAsync();

            // Отправляем локализованное сообщение обратно в Telegram
            await SendMessageToUser(message.Chat.Id, localizedGreeting);
        }

        private async Task SendMessageToUser(long chatId, string text)
        {
            var url = $"https://api.telegram.org/bot<your_bot_token>/sendMessage";
            var payload = new { chat_id = chatId, text = text };
            await _httpClient.PostAsJsonAsync(url, payload);
        }
    }
}
