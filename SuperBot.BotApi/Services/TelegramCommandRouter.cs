using System.Diagnostics;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using SuperBot.BotApi.Types;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;

namespace SuperBot.BotApi.Services;

public sealed class TelegramCommandRouter
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private static readonly Dictionary<string, ConfigValueBinding> SetBindings = new(StringComparer.OrdinalIgnoreCase)
    {
        ["automation.interval"] = new("automation.intervalSeconds", 1, 86_400),
        ["automation.firstDelay"] = new("automation.firstDelaySeconds", 0, 86_400),
        ["telegram.maxOrders"] = new("telegram.maxOrdersInSummary", 1, 100),
        ["analysis.minFit"] = new("analysis.minFitScore", 0, 100),
        ["analysis.minInterest"] = new("analysis.minInterestScore", 0, 100),
        ["analysis.maxRisk"] = new("analysis.maxRiskScore", 0, 100)
    };

    private static readonly Dictionary<string, ToggleBinding> ToggleBindings = new(StringComparer.OrdinalIgnoreCase)
    {
        ["toggle_telegram_enabled"] = new("telegram.enabled"),
        ["toggle_telegram_summary"] = new("automation.sendTelegramSummary"),
        ["toggle_telegram_empty_summary"] = new("telegram.sendSummaryWhenNoInterestingOrders"),
        ["toggle_proxy_enabled"] = new("proxy.enabled"),
        ["toggle_automation_enabled"] = new("automation.enabled"),
        ["toggle_analyze_only_new"] = new("automation.analyzeOnlyNewOrChanged"),
        ["toggle_save_snapshots"] = new("parser.saveSnapshots")
    };

    private readonly ITelegramBotClient _bot;
    private readonly ILogger<TelegramCommandRouter> _logger;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly string _rootPath;
    private readonly string _appConfigPath;
    private readonly string _secretsPath;
    private readonly string _runtimePath;
    private string? _botUsername;

    public TelegramCommandRouter(
        ITelegramBotClient bot,
        ILogger<TelegramCommandRouter> logger,
        IOptions<BotConfiguration> botConfiguration,
        IHttpClientFactory httpClientFactory,
        IWebHostEnvironment environment)
    {
        _bot = bot;
        _logger = logger;
        _ = botConfiguration.Value;
        _httpClientFactory = httpClientFactory;
        _rootPath = FindRepositoryRoot(environment.ContentRootPath);
        _appConfigPath = Path.Combine(_rootPath, "Jsons", "config", "app_config.json");
        _secretsPath = Path.Combine(_rootPath, "Jsons", "config", "secrets.local.json");
        _runtimePath = Path.Combine(_rootPath, "Jsons", "runtime");
    }

    public async Task<bool> TryHandleMessageAsync(Message message, CancellationToken cancellationToken)
    {
        if (message.Text is not { Length: > 0 } text || !text.TrimStart().StartsWith('/'))
        {
            return false;
        }

        var context = CommandContext.FromMessage(message);
        var command = NormalizeCommand(text);
        await LogAsync("INFO", $"Telegram command received: {command} chatId={context.ChatId}", cancellationToken);

        try
        {
            if (!await EnsureAccessAsync(context, command, cancellationToken))
            {
                await LogAsync("WARN", $"Unauthorized Telegram command: {command} chatId={context.ChatId}", cancellationToken);
                return true;
            }

            var args = SplitArguments(text).Skip(1).ToArray();
            switch (command)
            {
                case "/start":
                    await SendStartAsync(context, cancellationToken);
                    break;
                case "/help":
                    await SendHelpAsync(context.ChatId, cancellationToken);
                    break;
                case "/whoami":
                    await SendWhoAmIAsync(context, cancellationToken);
                    break;
                case "/status":
                    await SendStatusAsync(context.ChatId, cancellationToken);
                    break;
                case "/config":
                    await SendConfigAsync(context.ChatId, cancellationToken);
                    break;
                case "/proxy":
                    await SendProxyAsync(context.ChatId, cancellationToken);
                    break;
                case "/test":
                    await SendTestAsync(context.ChatId, cancellationToken);
                    break;
                case "/test_buttons":
                    await SendTestButtonsAsync(context.ChatId, cancellationToken);
                    break;
                case "/runs":
                    await SendRunsAsync(context.ChatId, cancellationToken);
                    break;
                case "/latest":
                    await SendLatestAsync(context.ChatId, cancellationToken);
                    break;
                case "/summary":
                    await SendSummaryAsync(context.ChatId, cancellationToken);
                    break;
                case "/parse":
                    await RequireAdminAndRunAsync(context, "collect-projects", "Парсинг запущен", Array.Empty<string>(), cancellationToken);
                    break;
                case "/analyze":
                    await AnalyzeLatestAsync(context, cancellationToken);
                    break;
                case "/run":
                    await RequireAdminAndRunAsync(context, "automation-run-once", "Полный цикл запущен", Array.Empty<string>(), cancellationToken);
                    break;
                case "/auto":
                    await SendAutoAsync(context.ChatId, cancellationToken);
                    break;
                case "/auto_start":
                    await AutoStartAsync(context, cancellationToken);
                    break;
                case "/auto_stop":
                    await AutoStopAsync(context, cancellationToken);
                    break;
                case "/auto_once":
                    await RequireAdminAndRunAsync(context, "automation-run-once", "Один цикл запущен", Array.Empty<string>(), cancellationToken);
                    break;
                case "/order":
                    await SendOrderAsync(context.ChatId, args, cancellationToken);
                    break;
                case "/draft":
                    await GenerateDraftAsync(context.ChatId, args, null, cancellationToken);
                    break;
                case "/drafts":
                    await SendDraftsAsync(context.ChatId, cancellationToken);
                    break;
                case "/settings":
                    await SendSettingsMenuAsync(context.ChatId, cancellationToken);
                    break;
                case "/set":
                    await SetConfigValueAsync(context, args, cancellationToken);
                    break;
                default:
                    await SendMessageAsync(context.ChatId, "Неизвестная команда. Используй /help.", cancellationToken);
                    break;
            }

            await LogAsync("OK", $"Telegram command completed: {command}", cancellationToken);
        }
        catch (Exception error)
        {
            _logger.LogError(error, "Telegram command failed: {Command}", command);
            await LogAsync("ERROR", $"Telegram command failed: {command} error={SafeLog(error.Message)}", cancellationToken);
            await LogErrorJsonAsync(context, command, error, cancellationToken);
            await SendMessageAsync(context.ChatId, $"Ошибка выполнения команды: {error.Message}", cancellationToken);
        }

        return true;
    }

    public async Task<bool> TryHandleCallbackAsync(CallbackQuery callbackQuery, CancellationToken cancellationToken)
    {
        if (callbackQuery.Data is not { Length: > 0 } data)
        {
            if (callbackQuery.Id is { Length: > 0 })
            {
                await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, "Пустое действие", cancellationToken: cancellationToken);
            }
            return true;
        }

        var context = CommandContext.FromCallback(callbackQuery);
        await LogAsync("INFO", $"Telegram callback received: {SafeLog(data)} chatId={context.ChatId}", cancellationToken);

        if (!IsKnownCallback(data))
        {
            await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, "Неизвестное действие", cancellationToken: cancellationToken);
            await LogAsync("WARN", $"Unknown Telegram callback: {SafeLog(data)} chatId={context.ChatId}", cancellationToken);
            return false;
        }

        try
        {
            if (!await EnsureAccessAsync(context, data, cancellationToken))
            {
                await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, "Нет доступа", cancellationToken: cancellationToken);
                await LogAsync("WARN", $"Unauthorized Telegram callback: {SafeLog(data)} chatId={context.ChatId}", cancellationToken);
                return true;
            }

            switch (data)
            {
                case "test_ping":
                    await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, "Callback работает", cancellationToken: cancellationToken);
                    await SendMessageAsync(context.ChatId, "✅ Callback received successfully", cancellationToken);
                    return true;
                case "status":
                    await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);
                    await SendStatusAsync(context.ChatId, cancellationToken);
                    return true;
                case "summary_latest":
                    await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);
                    await SendSummaryAsync(context.ChatId, cancellationToken);
                    return true;
                case "runs_latest":
                    await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);
                    await SendRunsAsync(context.ChatId, cancellationToken);
                    return true;
                case "auto_menu":
                    await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);
                    await SendAutoAsync(context.ChatId, cancellationToken);
                    return true;
                case "auto_start":
                    await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);
                    await AutoStartAsync(context, cancellationToken);
                    return true;
                case "auto_stop":
                    await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);
                    await AutoStopAsync(context, cancellationToken);
                    return true;
                case "auto_once":
                    await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);
                    await RequireAdminAndRunAsync(context, "automation-run-once", "Один цикл запущен", Array.Empty<string>(), cancellationToken);
                    return true;
                case "settings_menu":
                    await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);
                    await SendSettingsMenuAsync(context.ChatId, cancellationToken);
                    return true;
                case "settings_ai":
                case "settings_analysis":
                case "settings_automation":
                case "settings_telegram":
                case "settings_proxy":
                case "settings_profile":
                    await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);
                    await SendSettingsSectionAsync(context.ChatId, data["settings_".Length..], cancellationToken);
                    return true;
            }

            if (ToggleBindings.TryGetValue(data, out var toggle))
            {
                await ToggleConfigAsync(context, callbackQuery.Id, toggle, cancellationToken);
                return true;
            }

            if (data.StartsWith("order_details:", StringComparison.OrdinalIgnoreCase))
            {
                await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);
                await SendOrderAsync(context.ChatId, [data.Split(':', 2)[1]], cancellationToken);
                return true;
            }

            if (data.StartsWith("generate_draft:", StringComparison.OrdinalIgnoreCase) ||
                data.StartsWith("regenerate_draft:", StringComparison.OrdinalIgnoreCase) ||
                data.StartsWith("draft_style_short:", StringComparison.OrdinalIgnoreCase) ||
                data.StartsWith("draft_style_confident:", StringComparison.OrdinalIgnoreCase) ||
                data.StartsWith("draft_style_technical:", StringComparison.OrdinalIgnoreCase))
            {
                await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);
                var parts = data.Split(':', 2);
                await GenerateDraftAsync(context.ChatId, [parts.ElementAtOrDefault(1) ?? string.Empty], parts[0], cancellationToken);
                return true;
            }

            if (data.StartsWith("send_proposal:", StringComparison.OrdinalIgnoreCase) ||
                data.StartsWith("confirm_send_proposal:", StringComparison.OrdinalIgnoreCase) ||
                data.StartsWith("cancel_send_proposal:", StringComparison.OrdinalIgnoreCase))
            {
                await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, "Draft flow принят", cancellationToken: cancellationToken);
                await SendMessageAsync(context.ChatId, "Draft flow command received. Отправка на Kwork выполняется существующим draft flow, если он подключен.", cancellationToken);
                return true;
            }

            await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, "Неизвестное действие", cancellationToken: cancellationToken);
            await LogAsync("WARN", $"Unknown Telegram callback: {SafeLog(data)} chatId={context.ChatId}", cancellationToken);
        }
        catch (Exception error)
        {
            _logger.LogError(error, "Telegram callback failed: {Callback}", data);
            await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, "Ошибка", cancellationToken: cancellationToken);
            await LogAsync("ERROR", $"Telegram callback failed: {SafeLog(data)} error={SafeLog(error.Message)}", cancellationToken);
            await LogErrorJsonAsync(context, data, error, cancellationToken);
        }

        return true;
    }

    public async Task RegisterBotCommandsAsync(CancellationToken cancellationToken)
    {
        var commands = new[]
        {
            new BotCommand { Command = "start", Description = "Показать chatId и статус доступа" },
            new BotCommand { Command = "help", Description = "Список команд" },
            new BotCommand { Command = "status", Description = "Статус StealthFlow" },
            new BotCommand { Command = "config", Description = "Безопасная сводка настроек" },
            new BotCommand { Command = "proxy", Description = "Проверка Telegram proxy" },
            new BotCommand { Command = "test", Description = "Тестовое сообщение" },
            new BotCommand { Command = "test_buttons", Description = "Проверка кнопок" },
            new BotCommand { Command = "runs", Description = "Последние запуски" },
            new BotCommand { Command = "latest", Description = "Последний анализ" },
            new BotCommand { Command = "summary", Description = "Повторить последний summary" },
            new BotCommand { Command = "parse", Description = "Запустить парсинг" },
            new BotCommand { Command = "analyze", Description = "Запустить анализ" },
            new BotCommand { Command = "run", Description = "Запустить полный цикл" },
            new BotCommand { Command = "auto", Description = "Меню авто-режима" },
            new BotCommand { Command = "order", Description = "Подробности заказа" },
            new BotCommand { Command = "draft", Description = "Сгенерировать отклик" },
            new BotCommand { Command = "drafts", Description = "Последние черновики" },
            new BotCommand { Command = "settings", Description = "Меню настроек" }
        };

        await _bot.SetMyCommandsAsync(commands, cancellationToken: cancellationToken);
    }

    private static bool IsKnownCallback(string data) =>
        data is "test_ping" or "status" or "summary_latest" or "runs_latest" or "auto_menu" or "auto_start" or "auto_stop" or "auto_once" or
            "settings_menu" or "settings_ai" or "settings_analysis" or "settings_automation" or "settings_telegram" or "settings_proxy" or "settings_profile" ||
        ToggleBindings.ContainsKey(data) ||
        data.StartsWith("order_details:", StringComparison.OrdinalIgnoreCase) ||
        data.StartsWith("generate_draft:", StringComparison.OrdinalIgnoreCase) ||
        data.StartsWith("regenerate_draft:", StringComparison.OrdinalIgnoreCase) ||
        data.StartsWith("draft_style_short:", StringComparison.OrdinalIgnoreCase) ||
        data.StartsWith("draft_style_confident:", StringComparison.OrdinalIgnoreCase) ||
        data.StartsWith("draft_style_technical:", StringComparison.OrdinalIgnoreCase) ||
        data.StartsWith("send_proposal:", StringComparison.OrdinalIgnoreCase) ||
        data.StartsWith("confirm_send_proposal:", StringComparison.OrdinalIgnoreCase) ||
        data.StartsWith("cancel_send_proposal:", StringComparison.OrdinalIgnoreCase);

    private async Task<bool> EnsureAccessAsync(CommandContext context, string action, CancellationToken cancellationToken)
    {
        var access = await GetAccessAsync(context.ChatId, cancellationToken);
        var normalized = NormalizeCommand(action);
        if (normalized is "/start" or "/whoami")
        {
            return true;
        }

        if (!access.IsAllowed)
        {
            await SendMessageAsync(context.ChatId, $"Нет доступа. Твой chatId: {context.ChatId}. Добавь его в allowedChatIds.", cancellationToken);
            return false;
        }

        if (IsAdminOnly(action) && !access.IsAdmin)
        {
            await SendMessageAsync(context.ChatId, $"Нет доступа администратора. Твой chatId: {context.ChatId}.", cancellationToken);
            return false;
        }

        return true;
    }

    private static bool IsAdminOnly(string action)
    {
        var normalized = NormalizeCommand(action);
        return normalized is "/parse" or "/analyze" or "/run" or "/auto_start" or "/auto_stop" or "/auto_once" or "/settings" or "/set"
            || action.StartsWith("toggle_", StringComparison.OrdinalIgnoreCase)
            || action is "auto_start" or "auto_stop" or "auto_once" or "settings_menu" or "settings_ai" or "settings_analysis" or "settings_automation" or "settings_telegram" or "settings_proxy" or "settings_profile";
    }

    private async Task SendStartAsync(CommandContext context, CancellationToken cancellationToken)
    {
        var access = await GetAccessAsync(context.ChatId, cancellationToken);
        var builder = new StringBuilder()
            .AppendLine("Привет, это StealthFlow Bot.")
            .AppendLine()
            .AppendLine($"Твой chatId: {context.ChatId}")
            .AppendLine($"Доступ: {(access.IsAllowed ? "разрешён" : "не разрешён")}")
            .AppendLine($"Роль: {access.Role}");

        if (!access.IsAllowed)
        {
            builder.AppendLine()
                .AppendLine("Если доступа нет:")
                .AppendLine("Добавь этот chatId в Jsons/config/secrets.local.json:")
                .AppendLine()
                .AppendLine("{")
                .AppendLine("  \"telegram\": {")
                .AppendLine($"    \"allowedChatIds\": [{context.ChatId}],")
                .AppendLine($"    \"notificationChatId\": {context.ChatId}")
                .AppendLine("  }")
                .AppendLine("}");
        }

        await SendMessageAsync(context.ChatId, builder.ToString(), cancellationToken);
    }

    private Task SendHelpAsync(long chatId, CancellationToken cancellationToken) => SendMessageAsync(chatId, """
Диагностика:
- /status
- /whoami
- /config
- /proxy
- /test
- /test_buttons

Запуски:
- /runs
- /latest
- /summary
- /parse
- /analyze
- /run

Авто-режим:
- /auto
- /auto_start
- /auto_stop
- /auto_once

Заказы:
- /order {id}
- /draft {id}
- /drafts

Настройки:
- /settings
- /set {key} {value}
""", cancellationToken);

    private async Task SendWhoAmIAsync(CommandContext context, CancellationToken cancellationToken)
    {
        var access = await GetAccessAsync(context.ChatId, cancellationToken);
        await SendMessageAsync(context.ChatId, $"""
chatId: {context.ChatId}
telegram username: {context.Username ?? "-"}
firstName: {context.FirstName ?? "-"}
access allowed: {access.IsAllowed.ToString().ToLowerInvariant()}
role: {access.Role}
""", cancellationToken);
    }

    private async Task SendStatusAsync(long chatId, CancellationToken cancellationToken)
    {
        var config = await LoadJsonObjectAsync(_appConfigPath, cancellationToken);
        var latestParse = await GetLatestParseManifestAsync(cancellationToken);
        var latestAnalysis = await GetLatestAnalysisManifestAsync(cancellationToken);
        var processes = GetWorkerProcessSummary();
        var externalIp = await TryGetExternalIpAsync(cancellationToken);

        await SendMessageAsync(chatId, $"""
StealthFlow status

Telegram:
- bot: @{await GetBotUsernameAsync(cancellationToken)}
- listener: running
- proxy: {EnabledText(GetBool(config, "proxy.enabled"))}
- external IP: {externalIp}

Automation:
- status: {GetAutoStatus()}
- last run: {GetText(config, "automation.lastRun", "-")}
- next run: {GetText(config, "automation.nextRun", "-")}

Latest parse run:
- parseRunId: {GetManifestId(latestParse, "parseRunId", "runId", "id")}
- total orders: {GetManifestInt(latestParse, "totalOrders", "ordersCount", "total")}

Latest analysis run:
- analysisRunId: {GetManifestId(latestAnalysis, "analysisRunId", "runId", "id")}
- take/watch/skip/errors: {GetManifestInt(latestAnalysis, "take", "takeCount")} / {GetManifestInt(latestAnalysis, "watch", "watchCount")} / {GetManifestInt(latestAnalysis, "skip", "skipCount")} / {GetManifestInt(latestAnalysis, "errors", "errorCount")}

Processes:
- active workers count: {processes.ActiveCount}
- running/stale/failed: {processes.Running} / {processes.Stale} / {processes.Failed}
""", cancellationToken);
    }

    private async Task SendConfigAsync(long chatId, CancellationToken cancellationToken)
    {
        var config = await LoadJsonObjectAsync(_appConfigPath, cancellationToken);
        var secrets = await LoadJsonObjectAsync(_secretsPath, cancellationToken);
        await SendMessageAsync(chatId, $"""
AI:
- provider: {GetText(config, "ai.provider")}
- model: {GetText(config, "ai.model")}
- baseUrl: {GetText(config, "ai.baseUrl")}

Analysis:
- minFitScore: {GetText(config, "analysis.minFitScore")}
- minInterestScore: {GetText(config, "analysis.minInterestScore")}
- maxRiskScore: {GetText(config, "analysis.maxRiskScore")}

Automation:
- enabled: {GetText(config, "automation.enabled")}
- intervalSeconds: {GetText(config, "automation.intervalSeconds")}
- runOnlyOnce: {GetText(config, "automation.runOnlyOnce")}
- analyzeOnlyNewOrChanged: {GetText(config, "automation.analyzeOnlyNewOrChanged")}
- sendTelegramSummary: {GetText(config, "automation.sendTelegramSummary")}

Telegram:
- enabled: {GetText(config, "telegram.enabled")}
- notificationChatId: {GetText(secrets, "telegram.notificationChatId", GetText(config, "telegram.notificationChatId"))}
- maxOrdersInSummary: {GetText(config, "telegram.maxOrdersInSummary")}
- sendSummaryWhenNoInterestingOrders: {GetText(config, "telegram.sendSummaryWhenNoInterestingOrders")}

Proxy:
- enabled: {GetText(config, "proxy.enabled")}
- type: {GetText(config, "proxy.type")}
- host: {GetText(config, "proxy.host")}
- port: {GetText(config, "proxy.port")}
- credentials: {CredentialsStatus(secrets, config)}
""", cancellationToken);
    }

    private async Task SendProxyAsync(long chatId, CancellationToken cancellationToken)
    {
        var config = await LoadJsonObjectAsync(_appConfigPath, cancellationToken);
        var secrets = await LoadJsonObjectAsync(_secretsPath, cancellationToken);
        var getMe = "FAILED";
        try
        {
            _ = await _bot.GetMeAsync(cancellationToken);
            getMe = "OK";
        }
        catch (Exception error)
        {
            _logger.LogWarning(error, "Telegram getMe failed during /proxy");
        }

        await SendMessageAsync(chatId, $"""
Proxy:
enabled: {GetText(config, "proxy.enabled", "false")}
type: {GetText(config, "proxy.type")}
endpoint: {GetText(config, "proxy.host")}:{GetText(config, "proxy.port")}
credentials: {CredentialsStatus(secrets, config)}
external IP: {await TryGetExternalIpAsync(cancellationToken)}
Telegram getMe: {getMe}
""", cancellationToken);
    }

    private async Task SendTestAsync(long chatId, CancellationToken cancellationToken)
    {
        var config = await LoadJsonObjectAsync(_appConfigPath, cancellationToken);
        await SendMessageAsync(chatId, $"""
StealthFlow test message
Time: {DateTimeOffset.UtcNow:O}
ChatId: {chatId}
Bot: @{await GetBotUsernameAsync(cancellationToken)}
Proxy: {EnabledText(GetBool(config, "proxy.enabled"))}
External IP: {await TryGetExternalIpAsync(cancellationToken)}
""", cancellationToken);
    }

    private Task SendTestButtonsAsync(long chatId, CancellationToken cancellationToken) =>
        _bot.SendTextMessageAsync(
            chatId,
            "Тест кнопок StealthFlow",
            replyMarkup: new InlineKeyboardMarkup(new[]
            {
                new[] { InlineKeyboardButton.WithCallbackData("Ping callback", "test_ping") },
                new[] { InlineKeyboardButton.WithCallbackData("Статус", "status") }
            }),
            cancellationToken: cancellationToken);

    private async Task SendRunsAsync(long chatId, CancellationToken cancellationToken)
    {
        var parseRuns = GetRunManifests(Path.Combine(_runtimePath, "parse_runs"), 5, "parseRunId", "ordersCount", "totalOrders");
        var analysisRuns = GetRunManifests(Path.Combine(_runtimePath, "analysis_runs"), 5, "analysisRunId", "take", "watch", "skip");
        var builder = new StringBuilder().AppendLine("Последние запуски парсинга:");
        AppendRuns(builder, parseRuns, isAnalysis: false);
        builder.AppendLine().AppendLine("Последние анализы:");
        AppendRuns(builder, analysisRuns, isAnalysis: true);
        await _bot.SendTextMessageAsync(chatId, builder.ToString(), replyMarkup: new InlineKeyboardMarkup(new[]
        {
            new[] { InlineKeyboardButton.WithCallbackData("Открыть последний summary", "summary_latest") },
            new[] { InlineKeyboardButton.WithCallbackData("Повторить summary", "summary_latest") },
            new[] { InlineKeyboardButton.WithCallbackData("Запустить новый цикл", "auto_once") }
        }), cancellationToken: cancellationToken);
    }

    private async Task SendLatestAsync(long chatId, CancellationToken cancellationToken)
    {
        var latest = await GetLatestAnalysisManifestAsync(cancellationToken);
        await _bot.SendTextMessageAsync(chatId, $"""
AnalysisRunId: {GetManifestId(latest, "analysisRunId", "runId", "id")}
ParseRunId: {GetManifestId(latest, "parseRunId")}
Всего: {GetManifestInt(latest, "total", "totalOrders")}
Take: {GetManifestInt(latest, "take", "takeCount")}
Watch: {GetManifestInt(latest, "watch", "watchCount")}
Skip: {GetManifestInt(latest, "skip", "skipCount")}
Errors: {GetManifestInt(latest, "errors", "errorCount")}
""", replyMarkup: new InlineKeyboardMarkup(new[]
        {
            new[] { InlineKeyboardButton.WithCallbackData("Summary", "summary_latest"), InlineKeyboardButton.WithCallbackData("Run again", "auto_once") },
            new[] { InlineKeyboardButton.WithCallbackData("Interesting", "runs_latest"), InlineKeyboardButton.WithCallbackData("Watch", "runs_latest") }
        }), cancellationToken: cancellationToken);
    }

    private async Task SendSummaryAsync(long chatId, CancellationToken cancellationToken)
    {
        var summaryPath = FindLatestFile(Path.Combine(_runtimePath, "analysis_runs"), "*summary*.txt")
            ?? FindLatestFile(Path.Combine(_runtimePath, "analysis_runs"), "*telegram*.txt");
        if (summaryPath is null)
        {
            var latest = await GetLatestAnalysisManifestAsync(cancellationToken);
            await SendMessageAsync(chatId, $"Последний summary не найден. Latest analysis: {GetManifestId(latest, "analysisRunId", "runId", "id")}", cancellationToken);
            return;
        }

        var text = await File.ReadAllTextAsync(summaryPath, cancellationToken);
        await SendMessageAsync(chatId, Truncate(text, 3900), cancellationToken);
    }

    private async Task AnalyzeLatestAsync(CommandContext context, CancellationToken cancellationToken)
    {
        var latest = await GetLatestParseManifestAsync(cancellationToken);
        var parseRunId = GetManifestId(latest, "parseRunId", "runId", "id");
        if (parseRunId == "-")
        {
            await SendMessageAsync(context.ChatId, "Нет сохраненного parse run. Сначала запусти /parse или /run.", cancellationToken);
            return;
        }

        await RequireAdminAndRunAsync(context, "analyze-orders", "Анализ запущен", ["--parse-run-id", parseRunId], cancellationToken);
    }

    private async Task SendAutoAsync(long chatId, CancellationToken cancellationToken)
    {
        var config = await LoadJsonObjectAsync(_appConfigPath, cancellationToken);
        await _bot.SendTextMessageAsync(chatId, $"""
Automation:
enabled: {GetText(config, "automation.enabled", "false")}
status: {GetAutoStatus()}
mode: {GetText(config, "automation.mode", "normal")}
interval: {GetText(config, "automation.intervalSeconds", "-")} sec
next run: {GetText(config, "automation.nextRun", "-")}
last run: {GetText(config, "automation.lastRun", "-")}
last result: {GetText(config, "automation.lastResult", "-")}
""", replyMarkup: new InlineKeyboardMarkup(new[]
        {
            new[] { InlineKeyboardButton.WithCallbackData("Старт", "auto_start"), InlineKeyboardButton.WithCallbackData("Стоп", "auto_stop") },
            new[] { InlineKeyboardButton.WithCallbackData("Запустить один цикл", "auto_once") },
            new[] { InlineKeyboardButton.WithCallbackData("Быстрый тест 10 сек", "auto_once") },
            new[] { InlineKeyboardButton.WithCallbackData("Настройки", "settings_menu") }
        }), cancellationToken: cancellationToken);
    }

    private async Task AutoStartAsync(CommandContext context, CancellationToken cancellationToken)
    {
        var access = await GetAccessAsync(context.ChatId, cancellationToken);
        if (!access.IsAdmin)
        {
            await SendMessageAsync(context.ChatId, $"Нет доступа администратора. Твой chatId: {context.ChatId}.", cancellationToken);
            return;
        }

        var running = Process.GetProcesses().FirstOrDefault(p => SafeProcessName(p).Contains("StealthFlow", StringComparison.OrdinalIgnoreCase));
        if (running is not null)
        {
            await SendMessageAsync(context.ChatId, $"Авто-режим уже запущен. PID: {running.Id}", cancellationToken);
            return;
        }

        await RequireAdminAndRunAsync(context, "automation-scheduler", "Авто-режим запущен", Array.Empty<string>(), cancellationToken);
    }

    private async Task AutoStopAsync(CommandContext context, CancellationToken cancellationToken)
    {
        var access = await GetAccessAsync(context.ChatId, cancellationToken);
        if (!access.IsAdmin)
        {
            await SendMessageAsync(context.ChatId, $"Нет доступа администратора. Твой chatId: {context.ChatId}.", cancellationToken);
            return;
        }

        Directory.CreateDirectory(_runtimePath);
        var stopFile = Path.Combine(_runtimePath, "automation.stop");
        await File.WriteAllTextAsync(stopFile, DateTimeOffset.UtcNow.ToString("O"), cancellationToken);
        await SendMessageAsync(context.ChatId, File.Exists(stopFile) ? "Авто-режим остановлен через stop-file." : "Авто-режим не запущен.", cancellationToken);
    }

    private async Task SendOrderAsync(long chatId, string[] args, CancellationToken cancellationToken)
    {
        if (args.Length == 0 || string.IsNullOrWhiteSpace(args[0]))
        {
            await SendMessageAsync(chatId, "Используй: /order {id} [analysisRunId]", cancellationToken);
            return;
        }

        var orderId = args[0];
        var record = await FindAnalysisRecordAsync(orderId, args.ElementAtOrDefault(1), cancellationToken);
        if (record is null)
        {
            await SendMessageAsync(chatId, $"Заказ {orderId} не найден в последнем analysis run.", cancellationToken);
            return;
        }

        await _bot.SendTextMessageAsync(chatId, $"""
📌 Заказ {orderId}
Название: {GetAny(record, "title", "name")}

📄 Описание заказчика:
{GetAny(record, "description", "customerDescription")}

🧠 Суть:
{GetAny(record, "summary", "essence")}

💰 Бюджет заказчика:
{GetAny(record, "budget", "customerBudget")}

💵 Моя цена:
{GetAny(record, "myPrice", "price")}

⏱️ Мой срок:
{GetAny(record, "myDeadline", "deadline")}

Fit / Interest / Risk
{GetAny(record, "fitScore")} / {GetAny(record, "interestScore")} / {GetAny(record, "riskScore")}

Почему:
{GetAny(record, "why", "reason")}

Риски:
{GetList(record, "risks")}

Что уточнить:
{GetList(record, "questions", "clarifications")}
""", replyMarkup: new InlineKeyboardMarkup(new[]
        {
            new[] { InlineKeyboardButton.WithCallbackData("✍️ Сгенерировать отклик", $"generate_draft:{orderId}") },
            new[] { InlineKeyboardButton.WithUrl("🔗 Открыть заказ", GetOrderUrl(record)) }
        }), cancellationToken: cancellationToken);
    }

    private async Task GenerateDraftAsync(long chatId, string[] args, string? style, CancellationToken cancellationToken)
    {
        if (args.Length == 0 || string.IsNullOrWhiteSpace(args[0]))
        {
            await SendMessageAsync(chatId, "Используй: /draft {id}", cancellationToken);
            return;
        }

        var orderId = args[0];
        var record = await FindAnalysisRecordAsync(orderId, null, cancellationToken);
        if (record is null)
        {
            await SendMessageAsync(chatId, $"Заказ {orderId} не найден в последнем analysis run.", cancellationToken);
            return;
        }

        var draftId = DateTimeOffset.UtcNow.ToString("yyyyMMddHHmmss");
        var draftText = BuildDraftText(record, style);
        var draftsDir = Path.Combine(_runtimePath, "drafts");
        Directory.CreateDirectory(draftsDir);
        var draft = new JsonObject
        {
            ["draftId"] = draftId,
            ["orderId"] = orderId,
            ["version"] = GetNextDraftVersion(draftsDir, orderId),
            ["status"] = "generated",
            ["style"] = style ?? "default",
            ["createdAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["text"] = draftText
        };
        await File.WriteAllTextAsync(Path.Combine(draftsDir, $"{orderId}_{draftId}.json"), draft.ToJsonString(JsonOptions), cancellationToken);

        await _bot.SendTextMessageAsync(chatId, draftText, replyMarkup: new InlineKeyboardMarkup(new[]
        {
            new[] { InlineKeyboardButton.WithCallbackData("🔁 Перегенерировать", $"regenerate_draft:{orderId}"), InlineKeyboardButton.WithCallbackData("✏️ Изменить", $"generate_draft:{orderId}") },
            new[] { InlineKeyboardButton.WithCallbackData("Коротко", $"draft_style_short:{orderId}"), InlineKeyboardButton.WithCallbackData("Увереннее", $"draft_style_confident:{orderId}"), InlineKeyboardButton.WithCallbackData("Технически", $"draft_style_technical:{orderId}") },
            new[] { InlineKeyboardButton.WithCallbackData("🚀 Отправить на Kwork", $"send_proposal:{orderId}:{draftId}") },
            new[] { InlineKeyboardButton.WithUrl("🔗 Открыть заказ", GetOrderUrl(record)) }
        }), cancellationToken: cancellationToken);
    }

    private async Task SendDraftsAsync(long chatId, CancellationToken cancellationToken)
    {
        var draftsDir = Path.Combine(_runtimePath, "drafts");
        var drafts = Directory.Exists(draftsDir)
            ? Directory.EnumerateFiles(draftsDir, "*.json").OrderByDescending(File.GetLastWriteTimeUtc).Take(10).ToArray()
            : Array.Empty<string>();
        if (drafts.Length == 0)
        {
            await SendMessageAsync(chatId, "Черновиков пока нет.", cancellationToken);
            return;
        }

        var builder = new StringBuilder();
        for (var i = 0; i < drafts.Length; i++)
        {
            var draft = await LoadJsonObjectAsync(drafts[i], cancellationToken);
            builder.AppendLine($"{i + 1}. {GetText(draft, "orderId")} — v{GetText(draft, "version")} — {GetText(draft, "status")} — {GetText(draft, "createdAt")}");
        }

        await _bot.SendTextMessageAsync(chatId, builder.ToString(), replyMarkup: new InlineKeyboardMarkup(new[]
        {
            new[] { InlineKeyboardButton.WithCallbackData("open draft", "runs_latest"), InlineKeyboardButton.WithCallbackData("regenerate", "runs_latest"), InlineKeyboardButton.WithCallbackData("send", "runs_latest") }
        }), cancellationToken: cancellationToken);
    }

    private async Task SendSettingsMenuAsync(long chatId, CancellationToken cancellationToken)
    {
        await _bot.SendTextMessageAsync(chatId, """
Настройки StealthFlow

Разделы:
- AI
- Analysis
- Automation
- Telegram
- Proxy
- Profile
""", replyMarkup: new InlineKeyboardMarkup(new[]
        {
            new[] { InlineKeyboardButton.WithCallbackData("AI", "settings_ai"), InlineKeyboardButton.WithCallbackData("Analysis", "settings_analysis") },
            new[] { InlineKeyboardButton.WithCallbackData("Automation", "settings_automation"), InlineKeyboardButton.WithCallbackData("Telegram", "settings_telegram") },
            new[] { InlineKeyboardButton.WithCallbackData("Proxy", "settings_proxy"), InlineKeyboardButton.WithCallbackData("Profile", "settings_profile") }
        }), cancellationToken: cancellationToken);
    }

    private async Task SendSettingsSectionAsync(long chatId, string section, CancellationToken cancellationToken)
    {
        var config = await LoadJsonObjectAsync(_appConfigPath, cancellationToken);
        var text = section switch
        {
            "ai" => $"AI\nprovider: {GetText(config, "ai.provider")}\nmodel: {GetText(config, "ai.model")}\nbaseUrl: {GetText(config, "ai.baseUrl")}",
            "analysis" => $"Analysis\nminFitScore: {GetText(config, "analysis.minFitScore")}\nminInterestScore: {GetText(config, "analysis.minInterestScore")}\nmaxRiskScore: {GetText(config, "analysis.maxRiskScore")}",
            "automation" => $"Automation\nenabled: {GetText(config, "automation.enabled")}\nintervalSeconds: {GetText(config, "automation.intervalSeconds")}\nanalyzeOnlyNewOrChanged: {GetText(config, "automation.analyzeOnlyNewOrChanged")}",
            "telegram" => $"Telegram\nenabled: {GetText(config, "telegram.enabled")}\nmaxOrdersInSummary: {GetText(config, "telegram.maxOrdersInSummary")}\nsendSummaryWhenNoInterestingOrders: {GetText(config, "telegram.sendSummaryWhenNoInterestingOrders")}",
            "proxy" => $"Proxy\nenabled: {GetText(config, "proxy.enabled")}\ntype: {GetText(config, "proxy.type")}\nhost: {GetText(config, "proxy.host")}\nport: {GetText(config, "proxy.port")}",
            "profile" => "Profile\nСекреты и cookies через Telegram не показываются и не меняются.",
            _ => "Неизвестный раздел"
        };

        await _bot.SendTextMessageAsync(chatId, text, replyMarkup: SettingsSectionButtons(section), cancellationToken: cancellationToken);
    }

    private static InlineKeyboardMarkup SettingsSectionButtons(string section) => section switch
    {
        "automation" => new InlineKeyboardMarkup(new[]
        {
            new[] { InlineKeyboardButton.WithCallbackData("toggle automation.enabled", "toggle_automation_enabled") },
            new[] { InlineKeyboardButton.WithCallbackData("toggle analyzeOnlyNew", "toggle_analyze_only_new") },
            new[] { InlineKeyboardButton.WithCallbackData("Назад", "settings_menu") }
        }),
        "telegram" => new InlineKeyboardMarkup(new[]
        {
            new[] { InlineKeyboardButton.WithCallbackData("toggle telegram.enabled", "toggle_telegram_enabled") },
            new[] { InlineKeyboardButton.WithCallbackData("toggle summary", "toggle_telegram_summary") },
            new[] { InlineKeyboardButton.WithCallbackData("toggle empty summary", "toggle_telegram_empty_summary") },
            new[] { InlineKeyboardButton.WithCallbackData("Назад", "settings_menu") }
        }),
        "proxy" => new InlineKeyboardMarkup(new[]
        {
            new[] { InlineKeyboardButton.WithCallbackData("toggle proxy.enabled", "toggle_proxy_enabled") },
            new[] { InlineKeyboardButton.WithCallbackData("Назад", "settings_menu") }
        }),
        _ => new InlineKeyboardMarkup(new[] { new[] { InlineKeyboardButton.WithCallbackData("Назад", "settings_menu") } })
    };

    private async Task ToggleConfigAsync(CommandContext context, string callbackId, ToggleBinding binding, CancellationToken cancellationToken)
    {
        if (!(await GetAccessAsync(context.ChatId, cancellationToken)).IsAdmin)
        {
            await _bot.AnswerCallbackQueryAsync(callbackId, "Нет доступа администратора", cancellationToken: cancellationToken);
            return;
        }

        var config = await LoadJsonObjectAsync(_appConfigPath, cancellationToken);
        var oldValue = GetBool(config, binding.Path);
        var newValue = !oldValue;
        BackupConfig();
        SetPath(config, binding.Path, JsonValue.Create(newValue));
        await SaveJsonObjectAsync(_appConfigPath, config, cancellationToken);
        await _bot.AnswerCallbackQueryAsync(callbackId, $"Настройка обновлена: {binding.Path} = {newValue.ToString().ToLowerInvariant()}", cancellationToken: cancellationToken);
        await SendMessageAsync(context.ChatId, $"Настройка обновлена: {binding.Path} = {newValue.ToString().ToLowerInvariant()}", cancellationToken);
    }

    private async Task SetConfigValueAsync(CommandContext context, string[] args, CancellationToken cancellationToken)
    {
        if (!(await GetAccessAsync(context.ChatId, cancellationToken)).IsAdmin)
        {
            await SendMessageAsync(context.ChatId, $"Нет доступа администратора. Твой chatId: {context.ChatId}.", cancellationToken);
            return;
        }

        if (args.Length != 2 || !SetBindings.TryGetValue(args[0], out var binding))
        {
            await SendMessageAsync(context.ChatId, "Разрешены только: automation.interval, automation.firstDelay, telegram.maxOrders, analysis.minFit, analysis.minInterest, analysis.maxRisk", cancellationToken);
            return;
        }

        if (!int.TryParse(args[1], out var value) || value < binding.Min || value > binding.Max)
        {
            await SendMessageAsync(context.ChatId, $"Некорректное значение. Диапазон: {binding.Min}..{binding.Max}", cancellationToken);
            return;
        }

        var config = await LoadJsonObjectAsync(_appConfigPath, cancellationToken);
        var old = GetText(config, binding.Path, "-");
        BackupConfig();
        SetPath(config, binding.Path, JsonValue.Create(value));
        await SaveJsonObjectAsync(_appConfigPath, config, cancellationToken);
        await SendMessageAsync(context.ChatId, $"""
Настройка обновлена:
{binding.Path}: {old} -> {value}
""", cancellationToken);
    }

    private async Task RequireAdminAndRunAsync(CommandContext context, string command, string startedText, IReadOnlyList<string> extraArgs, CancellationToken cancellationToken)
    {
        if (!(await GetAccessAsync(context.ChatId, cancellationToken)).IsAdmin)
        {
            await SendMessageAsync(context.ChatId, $"Нет доступа администратора. Твой chatId: {context.ChatId}.", cancellationToken);
            return;
        }

        var taskId = $"tg-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}"[..30];
        var process = StartWorkerProcess(command, taskId, extraArgs);
        await SendMessageAsync(context.ChatId, $"{startedText}. TaskId: {taskId}" + (process is null ? "\nCLI worker не найден, команда записана в лог." : $"\nPID: {process.Id}"), cancellationToken);
    }

    private Process? StartWorkerProcess(string command, string taskId, IReadOnlyList<string> extraArgs)
    {
        Directory.CreateDirectory(Path.Combine(_runtimePath, "logs"));
        var logPath = Path.Combine(_runtimePath, "logs", $"worker_{taskId}.log");
        var cliPath = FindCliPath();
        var args = new List<string>();
        string fileName;
        if (cliPath is not null)
        {
            fileName = cliPath;
        }
        else
        {
            fileName = "StealthFlow.Cli.exe";
        }

        args.Add(command);
        args.Add("--worker");
        args.Add("--task-id");
        args.Add(taskId);
        args.AddRange(extraArgs);

        var psi = new ProcessStartInfo(fileName)
        {
            WorkingDirectory = _rootPath,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        foreach (var arg in args)
        {
            psi.ArgumentList.Add(arg);
        }

        try
        {
            var process = Process.Start(psi);
            if (process is null)
            {
                File.AppendAllText(logPath, $"Failed to start {fileName} {string.Join(' ', args)}{Environment.NewLine}");
                return null;
            }

            _ = Task.Run(async () =>
            {
                await using var stream = new FileStream(logPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
                await using var writer = new StreamWriter(stream, Encoding.UTF8);
                await writer.WriteLineAsync($"Started: {fileName} {string.Join(' ', args)}");
                await writer.WriteLineAsync(await process.StandardOutput.ReadToEndAsync());
                await writer.WriteLineAsync(await process.StandardError.ReadToEndAsync());
                await process.WaitForExitAsync();
                await writer.WriteLineAsync($"ExitCode: {process.ExitCode}");
            });
            return process;
        }
        catch (Exception error)
        {
            File.AppendAllText(logPath, $"Failed to start {fileName} {string.Join(' ', args)}: {SafeLog(error.Message)}{Environment.NewLine}");
            return null;
        }
    }

    private string? FindCliPath()
    {
        var candidates = new[]
        {
            Path.Combine(_rootPath, "StealthFlow.Cli.exe"),
            Path.Combine(_rootPath, "StealthFlow.Cli", "bin", "Release", "net8.0", "StealthFlow.Cli.exe"),
            Path.Combine(_rootPath, "StealthFlow.Cli", "bin", "Debug", "net8.0", "StealthFlow.Cli.exe")
        };
        return candidates.FirstOrDefault(File.Exists);
    }

    private async Task<AccessInfo> GetAccessAsync(long chatId, CancellationToken cancellationToken)
    {
        var secrets = await LoadJsonObjectAsync(_secretsPath, cancellationToken);
        var allowed = GetLongArray(secrets, "telegram.allowedChatIds");
        var admins = GetLongArray(secrets, "telegram.adminChatIds");
        if (admins.Count == 0)
        {
            admins = allowed;
        }

        var isAllowed = allowed.Contains(chatId);
        var isAdmin = isAllowed && admins.Contains(chatId);
        return new AccessInfo(isAllowed, isAdmin, isAdmin ? "admin" : isAllowed ? "user" : "none");
    }

    private async Task<JsonObject> LoadJsonObjectAsync(string path, CancellationToken cancellationToken)
    {
        if (!File.Exists(path))
        {
            return new JsonObject();
        }

        try
        {
            await using var stream = File.OpenRead(path);
            return (await JsonNode.ParseAsync(stream, cancellationToken: cancellationToken) as JsonObject) ?? new JsonObject();
        }
        catch (JsonException)
        {
            return new JsonObject();
        }
    }

    private static async Task SaveJsonObjectAsync(string path, JsonObject json, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllTextAsync(path, json.ToJsonString(JsonOptions), cancellationToken);
    }

    private void BackupConfig()
    {
        if (!File.Exists(_appConfigPath))
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_appConfigPath)!);
            File.WriteAllText(_appConfigPath, "{}\n");
        }

        var backupDir = Path.Combine(_rootPath, "Jsons", "config", "backups");
        Directory.CreateDirectory(backupDir);
        File.Copy(_appConfigPath, Path.Combine(backupDir, $"app_config.{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.bak.json"), overwrite: false);
    }

    private async Task<JsonObject> GetLatestParseManifestAsync(CancellationToken cancellationToken)
    {
        var latest = Path.Combine(_runtimePath, "latest_parse_run.json");
        if (File.Exists(latest))
        {
            return await LoadJsonObjectAsync(latest, cancellationToken);
        }

        var manifest = FindLatestFile(Path.Combine(_runtimePath, "parse_runs"), "*.json");
        return manifest is null ? new JsonObject() : await LoadJsonObjectAsync(manifest, cancellationToken);
    }

    private async Task<JsonObject> GetLatestAnalysisManifestAsync(CancellationToken cancellationToken)
    {
        var latest = Path.Combine(_runtimePath, "latest_analysis_run.json");
        if (File.Exists(latest))
        {
            return await LoadJsonObjectAsync(latest, cancellationToken);
        }

        var manifest = FindLatestFile(Path.Combine(_runtimePath, "analysis_runs"), "*.json");
        return manifest is null ? new JsonObject() : await LoadJsonObjectAsync(manifest, cancellationToken);
    }

    private async Task<JsonObject?> FindAnalysisRecordAsync(string orderId, string? analysisRunId, CancellationToken cancellationToken)
    {
        var root = Path.Combine(_runtimePath, "analysis_runs");
        if (!Directory.Exists(root))
        {
            return null;
        }

        var files = Directory.EnumerateFiles(root, "*.json", SearchOption.AllDirectories)
            .Where(p => analysisRunId is null || p.Contains(analysisRunId, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(File.GetLastWriteTimeUtc);
        foreach (var file in files)
        {
            var node = await LoadJsonObjectAsync(file, cancellationToken);
            var records = node["records"] as JsonArray ?? node["orders"] as JsonArray ?? node["items"] as JsonArray;
            if (records is null)
            {
                if (NodeHasOrderId(node, orderId)) return node;
                continue;
            }

            foreach (var item in records.OfType<JsonObject>())
            {
                if (NodeHasOrderId(item, orderId)) return item;
            }
        }

        return null;
    }

    private static bool NodeHasOrderId(JsonObject node, string orderId) =>
        string.Equals(GetAny(node, "orderId", "id", "projectId"), orderId, StringComparison.OrdinalIgnoreCase);

    private static string GetOrderUrl(JsonObject record)
    {
        var url = GetAny(record, "url", "link", fallback: string.Empty);
        return Uri.TryCreate(url, UriKind.Absolute, out _) ? url : "https://kwork.ru";
    }

    private static string BuildDraftText(JsonObject record, string? style)
    {
        var styleHint = style switch
        {
            "draft_style_short" => "Короткий вариант.\n\n",
            "draft_style_confident" => "Уверенный вариант.\n\n",
            "draft_style_technical" => "Технический вариант.\n\n",
            _ => string.Empty
        };
        return $"""
{styleHint}Здравствуйте! Готов помочь с задачей «{GetAny(record, "title", "name")}".

Я вижу суть задачи так: {GetAny(record, "summary", "essence", fallback: "нужно уточнить детали и предложить аккуратное решение")}.

Предлагаю начать с короткого уточнения требований, затем подготовить реализацию и показать промежуточный результат.

Оценка: {GetAny(record, "myPrice", "price", fallback: "обсудим после уточнения")}
Срок: {GetAny(record, "myDeadline", "deadline", fallback: "обсудим после уточнения")}
""";
    }

    private static int GetNextDraftVersion(string draftsDir, string orderId) => Directory.EnumerateFiles(draftsDir, $"{orderId}_*.json").Count() + 1;

    private static IReadOnlyList<RunInfo> GetRunManifests(string root, int take, params string[] fields)
    {
        if (!Directory.Exists(root)) return Array.Empty<RunInfo>();
        return Directory.EnumerateFiles(root, "*.json", SearchOption.AllDirectories)
            .OrderByDescending(File.GetLastWriteTimeUtc)
            .Take(take)
            .Select(path =>
            {
                try
                {
                    var json = JsonNode.Parse(File.ReadAllText(path)) as JsonObject ?? new JsonObject();
                    return new RunInfo(GetManifestId(json, fields), json, File.GetLastWriteTimeUtc(path));
                }
                catch
                {
                    return new RunInfo(Path.GetFileNameWithoutExtension(path), new JsonObject(), File.GetLastWriteTimeUtc(path));
                }
            })
            .ToArray();
    }

    private static void AppendRuns(StringBuilder builder, IReadOnlyList<RunInfo> runs, bool isAnalysis)
    {
        if (runs.Count == 0)
        {
            builder.AppendLine("нет данных");
            return;
        }

        for (var i = 0; i < runs.Count; i++)
        {
            var status = GetText(runs[i].Manifest, "status", "completed");
            if (isAnalysis)
            {
                builder.AppendLine($"{i + 1}. {runs[i].Id} — take {GetManifestInt(runs[i].Manifest, "take", "takeCount")} / watch {GetManifestInt(runs[i].Manifest, "watch", "watchCount")} / skip {GetManifestInt(runs[i].Manifest, "skip", "skipCount")} — {status}");
            }
            else
            {
                builder.AppendLine($"{i + 1}. {runs[i].Id} — {GetManifestInt(runs[i].Manifest, "totalOrders", "ordersCount", "total")} заказов — {status}");
            }
        }
    }

    private ProcessSummary GetWorkerProcessSummary()
    {
        var workers = Process.GetProcesses()
            .Where(p => SafeProcessName(p).Contains("StealthFlow", StringComparison.OrdinalIgnoreCase) || SafeProcessName(p).Contains("worker", StringComparison.OrdinalIgnoreCase))
            .ToArray();
        return new ProcessSummary(workers.Length, workers.Length, 0, 0);
    }

    private string GetAutoStatus() => File.Exists(Path.Combine(_runtimePath, "automation.stop")) ? "stopped" : "running";

    private async Task<string> TryGetExternalIpAsync(CancellationToken cancellationToken)
    {
        try
        {
            var http = _httpClientFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(5);
            return (await http.GetStringAsync("https://api.ipify.org", cancellationToken)).Trim();
        }
        catch
        {
            return "unavailable";
        }
    }

    private async Task<string> GetBotUsernameAsync(CancellationToken cancellationToken)
    {
        if (_botUsername is not null) return _botUsername;
        try
        {
            var me = await _bot.GetMeAsync(cancellationToken);
            _botUsername = me.Username ?? "unknown";
        }
        catch
        {
            _botUsername = "unknown";
        }
        return _botUsername;
    }

    private Task SendMessageAsync(long chatId, string text, CancellationToken cancellationToken) =>
        _bot.SendTextMessageAsync(chatId, Truncate(text, 3900), cancellationToken: cancellationToken);

    private async Task LogAsync(string level, string message, CancellationToken cancellationToken)
    {
        var logDir = Path.Combine(_runtimePath, "logs");
        Directory.CreateDirectory(logDir);
        await File.AppendAllTextAsync(Path.Combine(logDir, "telegram_bot.log"), $"[{level}] {DateTimeOffset.UtcNow:O} {message}{Environment.NewLine}", cancellationToken);
    }

    private async Task LogErrorJsonAsync(CommandContext context, string action, Exception error, CancellationToken cancellationToken)
    {
        var errorDir = Path.Combine(_runtimePath, "errors");
        Directory.CreateDirectory(errorDir);
        var json = JsonSerializer.Serialize(new
        {
            time = DateTimeOffset.UtcNow,
            chatId = context.ChatId,
            action = SafeLog(action),
            error = SafeLog(error.Message),
            type = error.GetType().FullName
        });
        await File.AppendAllTextAsync(Path.Combine(errorDir, "telegram_errors.jsonl"), json + Environment.NewLine, cancellationToken);
    }

    private static string? FindLatestFile(string root, string pattern)
    {
        return Directory.Exists(root)
            ? Directory.EnumerateFiles(root, pattern, SearchOption.AllDirectories).OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault()
            : null;
    }

    private static string FindRepositoryRoot(string start)
    {
        var dir = new DirectoryInfo(start);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "SuperBot.sln")) || Directory.Exists(Path.Combine(dir.FullName, ".git")))
            {
                return dir.FullName;
            }
            dir = dir.Parent;
        }
        return start;
    }

    private static string NormalizeCommand(string text)
    {
        var token = SplitArguments(text).FirstOrDefault() ?? text;
        var at = token.IndexOf('@');
        if (at >= 0) token = token[..at];
        return token.StartsWith('/') ? token.ToLowerInvariant() : token;
    }

    private static IEnumerable<string> SplitArguments(string text) => text.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private static string SafeProcessName(Process process)
    {
        try { return process.ProcessName; } catch { return string.Empty; }
    }

    private static string SafeLog(string value) => value
        .Replace("\r", " ", StringComparison.Ordinal)
        .Replace("\n", " ", StringComparison.Ordinal)
        .Replace("botToken", "***", StringComparison.OrdinalIgnoreCase)
        .Replace("password", "***", StringComparison.OrdinalIgnoreCase)
        .Replace("cookie", "***", StringComparison.OrdinalIgnoreCase);

    private static string Truncate(string value, int maxLength) => value.Length <= maxLength ? value : value[..maxLength] + "…";

    private static bool GetBool(JsonObject json, string path)
    {
        var node = GetNode(json, path);
        return node is not null && bool.TryParse(node.ToString(), out var value) && value;
    }

    private static string GetText(JsonObject json, string path, string fallback = "-")
    {
        var node = GetNode(json, path);
        if (node is null) return fallback;
        if (node is JsonArray) return "[array]";
        if (node is JsonObject) return "[object]";
        var text = node.ToString();
        return string.IsNullOrWhiteSpace(text) ? fallback : text;
    }

    private static JsonNode? GetNode(JsonObject json, string path)
    {
        JsonNode? current = json;
        foreach (var part in path.Split('.'))
        {
            current = current?[part];
        }
        return current;
    }

    private static void SetPath(JsonObject json, string path, JsonNode? value)
    {
        var parts = path.Split('.');
        var current = json;
        foreach (var part in parts.Take(parts.Length - 1))
        {
            if (current[part] is not JsonObject child)
            {
                child = new JsonObject();
                current[part] = child;
            }
            current = child;
        }
        current[parts[^1]] = value;
    }

    private static List<long> GetLongArray(JsonObject json, string path)
    {
        var node = GetNode(json, path) as JsonArray;
        return node?.Select(x => long.TryParse(x?.ToString(), out var value) ? value : 0).Where(x => x != 0).ToList() ?? [];
    }

    private static string CredentialsStatus(JsonObject secrets, JsonObject config)
    {
        var username = GetText(secrets, "proxy.username", GetText(config, "proxy.username", string.Empty));
        var passwordPresent = GetNode(secrets, "proxy.password") is not null || GetNode(config, "proxy.password") is not null;
        return !string.IsNullOrEmpty(username) || passwordPresent ? "present" : "missing";
    }

    private static string EnabledText(bool enabled) => enabled ? "enabled" : "disabled";

    private static string GetManifestId(JsonObject json, params string[] fields) => fields.Select(field => GetText(json, field, string.Empty)).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? "-";

    private static string GetManifestInt(JsonObject json, params string[] fields) => fields.Select(field => GetText(json, field, string.Empty)).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? "0";

    private static string GetAny(JsonObject json, params string[] fields) => GetAny(json, fields, "-");

    private static string GetAny(JsonObject json, string[] fields, string fallback)
    {
        foreach (var field in fields)
        {
            var value = GetText(json, field, string.Empty);
            if (!string.IsNullOrWhiteSpace(value)) return value;
        }
        return fallback;
    }

    private static string GetAny(JsonObject json, string field1, string field2, string? field3 = null, string fallback = "-")
    {
        var fields = field3 is null ? new[] { field1, field2 } : new[] { field1, field2, field3 };
        return GetAny(json, fields, fallback);
    }

    private static string GetList(JsonObject json, params string[] fields)
    {
        foreach (var field in fields)
        {
            if (GetNode(json, field) is JsonArray array)
            {
                return string.Join(Environment.NewLine, array.Select(x => $"- {x}"));
            }
        }
        return "-";
    }

    private sealed record AccessInfo(bool IsAllowed, bool IsAdmin, string Role);
    private sealed record ConfigValueBinding(string Path, int Min, int Max);
    private sealed record ToggleBinding(string Path);
    private sealed record RunInfo(string Id, JsonObject Manifest, DateTime UpdatedAt);
    private sealed record ProcessSummary(int ActiveCount, int Running, int Stale, int Failed);

    private sealed record CommandContext(long ChatId, long UserId, string? Username, string? FirstName)
    {
        public static CommandContext FromMessage(Message message) => new(
            message.Chat.Id,
            message.From?.Id ?? message.Chat.Id,
            message.From?.Username,
            message.From?.FirstName);

        public static CommandContext FromCallback(CallbackQuery callbackQuery) => new(
            callbackQuery.Message?.Chat.Id ?? callbackQuery.From.Id,
            callbackQuery.From.Id,
            callbackQuery.From.Username,
            callbackQuery.From.FirstName);
    }
}
