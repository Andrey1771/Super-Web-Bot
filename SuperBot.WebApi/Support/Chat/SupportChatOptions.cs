namespace SuperBot.WebApi.Support.Chat;

public class SupportChatOptions
{
    public string OllamaBaseUrl { get; set; } = "http://localhost:11434";

    // qwen2.5 has strong tool-calling + multilingual (RU/EN) support and does not emit reasoning
    // tokens, which makes it the best local fit for a support agent. The pipeline stays compatible
    // with any model (reasoning output is stripped defensively).
    public string OllamaModel { get; set; } = "qwen2.5:7b";

    public bool StreamingEnabled { get; set; } = true;

    public int MessageMaxLength { get; set; } = 2000;

    public int RateLimitPerMinute { get; set; } = 12;

    public int HistoryLimit { get; set; } = 30;

    public int LlmTimeoutSeconds { get; set; } = 45;

    // Lower temperature keeps a support agent factual and on-policy.
    public double Temperature { get; set; } = 0.3;

    // How many knowledge-base articles to inject as grounding context per turn.
    public int KnowledgeArticles { get; set; } = 3;

    // Email address that receives a notification when a chat is escalated to a human.
    // Falls back to the SMTP FromAddress channel; empty disables the email notification.
    public string? SpecialistEmail { get; set; }

    // Toggles for handoff notifications (both default on).
    public bool NotifyTelegramOnEscalation { get; set; } = true;

    public bool NotifyEmailOnEscalation { get; set; } = true;

    // --- Abuse / load protection ---------------------------------------------

    // Max simultaneous LLM generations across the whole app. Self-hosted Ollama can be saturated
    // by spam; excess requests wait briefly then get a "busy" reply instead of piling on the model.
    public int MaxConcurrentLlm { get; set; } = 3;

    // How long a request waits for a free LLM slot before returning the "busy" message.
    public int LlmBusyWaitSeconds { get; set; } = 6;

    // Per-IP caps (real client IP resolved from X-Forwarded-For behind nginx).
    public int MaxSessionsPerIpPerHour { get; set; } = 15;

    public int MaxMessagesPerIpPerMinute { get; set; } = 20;

    // Lifetime cap on user messages within a single chat session.
    public int MaxMessagesPerSession { get; set; } = 80;

    // --- Cloudflare Turnstile (bot check on session creation) ----------------
    // Public site key — sent to the frontend so it can render the widget. Empty = widget disabled.
    public string? TurnstileSiteKey { get; set; }

    // Secret key (from env/user-secrets) — used server-side to verify the token.
    // Empty = verification disabled (fail-open), so the chat keeps working until keys are configured.
    public string? TurnstileSecretKey { get; set; }
}
