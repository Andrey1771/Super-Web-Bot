namespace SuperBot.WebApi.Support.Chat;

public class SupportChatOptions
{
    public string OllamaBaseUrl { get; set; } = "http://localhost:11434";

    public string OllamaModel { get; set; } = "gemma3";

    public bool StreamingEnabled { get; set; } = true;

    public int MessageMaxLength { get; set; } = 2000;

    public int RateLimitPerMinute { get; set; } = 12;

    public int HistoryLimit { get; set; } = 30;

    public int LlmTimeoutSeconds { get; set; } = 45;
}
