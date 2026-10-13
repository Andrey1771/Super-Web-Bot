using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SuperBot.WebApi.Support.Chat;
using SuperBot.WebApi.Support.Chat.Services;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Запрос к DeepSeek. У моделей V4 «размышление» включено по умолчанию: на короткий вопрос поддержки большая часть
/// токенов уходила на рассуждение, а при потолке длины ответа бот мог ответить пустотой. Поэтому его выключаем.
/// </summary>
public class DeepSeekChatClientTests
{
    private sealed class CapturingHandler : HttpMessageHandler
    {
        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Body = await request.Content!.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    """{"choices":[{"message":{"role":"assistant","content":"Instantly."}}],"usage":{"prompt_tokens":10,"completion_tokens":2}}""",
                    Encoding.UTF8, "application/json")
            };
        }
    }

    private static async Task<(JsonElement Request, string Answer)> AskAsync(string? thinking)
    {
        var handler = new CapturingHandler();
        var options = new SupportChatOptions { DeepSeekApiKey = "sk-test", DeepSeekModel = "deepseek-flash", DeepSeekThinking = thinking };
        var client = new DeepSeekChatClient(new HttpClient(handler), Options.Create(options), NullLogger<DeepSeekChatClient>.Instance);

        var response = await client.ChatAsync(new LlmChatRequest
        {
            Messages = { new LlmChatMessage { Role = "user", Content = "How fast do I get my key?" } },
            MaxOutputTokens = 400
        }, CancellationToken.None);

        return (JsonDocument.Parse(handler.Body!).RootElement, response.Content);
    }

    [Fact]
    public async Task Thinking_is_disabled_by_default_for_support_replies()
    {
        var (request, answer) = await AskAsync(new SupportChatOptions().DeepSeekThinking);

        Assert.Equal("disabled", request.GetProperty("thinking").GetProperty("type").GetString());
        Assert.Equal("deepseek-flash", request.GetProperty("model").GetString());
        Assert.Equal("Instantly.", answer);
    }

    [Fact]
    public async Task Empty_setting_leaves_the_field_out_for_models_without_it()
    {
        var (request, _) = await AskAsync(null);

        Assert.False(request.TryGetProperty("thinking", out _));
    }
}
