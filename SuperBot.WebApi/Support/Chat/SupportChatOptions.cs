namespace SuperBot.WebApi.Support.Chat;

public class SupportChatOptions
{
    // --- Провайдер модели ------------------------------------------------------
    // "ollama" — локальная модель, "deepseek" — внешний API. Выбор не жёсткий: если внешний
    // провайдер не настроен, недоступен или выбран дневной бюджет, ответы идёт давать Ollama.
    public string Provider { get; set; } = "ollama";

    // Сколько секунд не трогать внешний API после сбоя, чтобы не ждать таймаут на каждом запросе.
    public int ProviderCooldownSeconds { get; set; } = 60;

    // Потолок длины ответа. Выход дороже входа, а хороший ответ поддержки — 3–5 предложений.
    public int MaxResponseTokens { get; set; } = 400;

    // --- DeepSeek (OpenAI-совместимый API) -------------------------------------
    public string DeepSeekBaseUrl { get; set; } = "https://api.deepseek.com/v1";

    // Ключ приходит из env/user-secrets. Пусто — провайдер считается ненастроенным.
    public string? DeepSeekApiKey { get; set; }

    // Имя модели задаётся явно: список моделей у провайдера меняется, а reasoning-версию брать
    // не нужно — её «размышления» оплачиваются как ответ и для поддержки бесполезны.
    public string DeepSeekModel { get; set; } = string.Empty;

    // --- Дневной бюджет --------------------------------------------------------
    // 0 — без ограничения. Цены за миллион токенов, сверяться с прайсом провайдера.
    public decimal DailyBudgetUsd { get; set; } = 0m;

    public decimal InputPricePerMillionUsd { get; set; } = 0.14m;

    public decimal CachedInputPricePerMillionUsd { get; set; } = 0.0028m;

    public decimal OutputPricePerMillionUsd { get; set; } = 0.28m;

    public string OllamaBaseUrl { get; set; } = "http://localhost:11434";

    // qwen2.5 has strong tool-calling + multilingual (RU/EN) support and does not emit reasoning
    // tokens, which makes it the best local fit for a support agent. The pipeline stays compatible
    // with any model (reasoning output is stripped defensively).
    public string OllamaModel { get; set; } = "qwen2.5:7b";

    public bool StreamingEnabled { get; set; } = true;

    public int MessageMaxLength { get; set; } = 2000;

    public int RateLimitPerMinute { get; set; } = 12;

    // Потолок числа сообщений диалога в запросе.
    public int HistoryLimit { get; set; } = 24;

    // Обрезаем историю не каждый ход, а ступенями по столько сообщений. Начало запроса при этом
    // остаётся байт-в-байт прежним несколько ходов подряд — только так работает кэш промпта
    // у внешнего провайдера (попадание в кэш дешевле промаха в десятки раз).
    public int HistoryTrimStepMessages { get; set; } = 8;

    public int LlmTimeoutSeconds { get; set; } = 45;

    // Lower temperature keeps a support agent factual and on-policy.
    public double Temperature { get; set; } = 0.3;

    // How many knowledge-base articles to inject as grounding context per turn.
    public int KnowledgeArticles { get; set; } = 2;

    // Потолок длины одной статьи базы знаний в запросе. 0 — не обрезать.
    public int KnowledgeArticleMaxChars { get; set; } = 700;

    // --- Готовые ответы без обращения к модели ---------------------------------
    // Частые вопросы закрываются заранее написанным текстом: мгновенно и бесплатно.
    public bool InstantAnswersEnabled { get; set; } = true;

    // Пороги «простоты» вопроса: длинный вопрос почти всегда со своими деталями,
    // и шаблон на него не отвечает — такие уходят модели.
    public int InstantAnswerMaxWords { get; set; } = 10;

    public int InstantAnswerMaxChars { get; set; } = 160;

    // --- Часы работы поддержки -------------------------------------------------
    // Выключено — обещаем только типичное ожидание, без «ответим утром».
    public bool BusinessHoursEnabled { get; set; } = false;

    // IANA-идентификатор, например "Europe/Moscow". Неизвестный — считаем по UTC.
    public string BusinessHoursTimeZone { get; set; } = "UTC";

    public int BusinessHoursStart { get; set; } = 10;

    public int BusinessHoursEnd { get; set; } = 19;

    // Дни недели числами 1–7 (пн–вс). Пустой список — работаем всю неделю.
    public int[] BusinessDays { get; set; } = { 1, 2, 3, 4, 5 };

    // Типичное время ответа специалиста в рабочие часы. 0 — не называть срок.
    public int ExpectedWaitMinutes { get; set; } = 15;

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
