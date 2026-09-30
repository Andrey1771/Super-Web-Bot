namespace SuperBot.Core.Services
{
    /// <summary>Что не так с вебхуком Telegram.</summary>
    public enum WebhookDiagnosis
    {
        /// <summary>Адрес зарегистрирован, отвечает, свежих отказов нет.</summary>
        Ok,

        /// <summary>У Telegram вебхука нет вовсе — бот не получит ни сообщений, ни нажатий.</summary>
        NotRegistered,

        /// <summary>Telegram шлёт обновления не туда, где нас слушают.</summary>
        UrlMismatch,

        /// <summary>По зарегистрированному адресу вообще никто не отвечает.</summary>
        Unreachable,

        /// <summary>Адрес отвечает, но не нашей ручкой: обычно там уже чужой сервис.</summary>
        WrongResponse,

        /// <summary>Адрес наш, но доставка сейчас не проходит.</summary>
        DeliveryFailing,

        /// <summary>Отказы были, но давно, и очередь разобрана — сообщаем без тревоги.</summary>
        PastErrors
    }

    /// <summary>Чем закончилась попытка достучаться до зарегистрированного адреса.</summary>
    public enum WebhookReachability
    {
        /// <summary>Не проверяли (например, адреса нет вовсе).</summary>
        NotChecked,

        /// <summary>Ответила наша ручка.</summary>
        Reachable,

        /// <summary>Кто-то ответил, но это не наша ручка.</summary>
        AnsweredWrong,

        /// <summary>Ответа нет: не резолвится, не соединяется, молчит.</summary>
        NoAnswer
    }

    public readonly record struct WebhookHealthReport(WebhookDiagnosis Diagnosis, string Message);

    /// <summary>
    /// Разбор состояния вебхука: что говорит getWebhookInfo плюс живая проверка адреса.
    ///
    /// Опроса (getUpdates) в проекте нет: обновления приходят только вебхуком. Поэтому мёртвый
    /// адрес выглядит не как поломка, а как тишина — сервис жив, лог чист, бот молчит. Дороже
    /// всего обходится смена туннеля: бесплатный ngrok выдаёт новый поддомен на каждый запуск,
    /// в Telegram остаётся старый, и все обновления упираются в чужой 404.
    ///
    /// Одних жалоб Telegram для диагноза мало, и это выяснилось на практике. Ошибки доставки он
    /// показывает только по факту доставки: если боту сутки никто не писал, очередь пуста, а
    /// последняя ошибка «старая» — по этим данным вебхук выглядит здоровым, хотя туннеля давно
    /// нет. Поэтому адрес ещё и опрашивается напрямую: молчащий чат больше не выдаётся за
    /// исправную доставку.
    ///
    /// Логика вынесена из хостед-сервиса, чтобы её можно было проверить тестами: сами запросы
    /// в тесте не повторить, а вот правила «что считать поломкой» — главное здесь.
    /// </summary>
    public static class WebhookHealth
    {
        /// <summary>
        /// Насколько свежим должен быть отказ, чтобы считать доставку сломанной сейчас.
        ///
        /// Telegram не сбрасывает last_error_date после успешной доставки — он держится до
        /// следующей ошибки или до повторного setWebhook. Один только факт ошибки поэтому
        /// ничего не значит: без окна давности сервис ругался бы на давно починенную неполадку
        /// при каждом перезапуске.
        /// </summary>
        public static readonly TimeSpan RecentErrorWindow = TimeSpan.FromHours(24);

        public static WebhookHealthReport Inspect(
            string? registeredUrl,
            string? configuredUrl,
            DateTime? lastErrorUtc,
            string? lastErrorMessage,
            int pendingUpdateCount,
            DateTime utcNow,
            WebhookReachability reachability = WebhookReachability.NotChecked,
            string? reachabilityDetail = null)
        {
            var registered = registeredUrl?.Trim() ?? string.Empty;
            var configured = configuredUrl?.Trim() ?? string.Empty;

            if (registered.Length == 0)
            {
                return new WebhookHealthReport(
                    WebhookDiagnosis.NotRegistered,
                    "Telegram has no webhook registered for this bot, so it receives nothing: this project has no polling mode. "
                    + "Register it in the admin panel (Bot section) or with POST /api/admin/bot/webhook.");
            }

            // Разный адрес важнее всего остального: пока Telegram стучится не туда, и отказы
            // доставки, и результат опроса — следствия. Сравниваем как адреса, а не как строки:
            // хвостовой слеш и регистр хоста поводом для тревоги быть не должны.
            if (configured.Length > 0 && !SameEndpoint(registered, configured))
            {
                return new WebhookHealthReport(
                    WebhookDiagnosis.UrlMismatch,
                    $"Telegram delivers updates to {registered}, but this service expects {configured}. "
                    + "Updates are going elsewhere. The usual cause is a changed tunnel address — a free ngrok "
                    + "subdomain is new on every start — so put the current address into BOT_WEBHOOK_URL and register it again.");
            }

            // Живая проверка адреса важнее давности ошибок: она говорит о том, что происходит
            // сейчас, а жалобы Telegram — только о том, что было при последней доставке.
            var detail = string.IsNullOrWhiteSpace(reachabilityDetail) ? string.Empty : $" ({reachabilityDetail.Trim()})";

            if (reachability == WebhookReachability.NoAnswer)
            {
                return new WebhookHealthReport(
                    WebhookDiagnosis.Unreachable,
                    $"Nothing answers at {registered}{detail}, so Telegram has nowhere to deliver updates. "
                    + "If the address comes from a tunnel, start it again, put the new address into BOT_WEBHOOK_URL and register it.");
            }

            if (reachability == WebhookReachability.AnsweredWrong)
            {
                return new WebhookHealthReport(
                    WebhookDiagnosis.WrongResponse,
                    $"{registered} answers, but not with this bot's webhook{detail}. The address is taken by something else — "
                    + "a released tunnel subdomain usually answers 404. Register the current address in BOT_WEBHOOK_URL.");
            }

            var errorIsRecent = lastErrorUtc.HasValue && utcNow - lastErrorUtc.Value <= RecentErrorWindow;

            if (errorIsRecent)
            {
                var reason = string.IsNullOrWhiteSpace(lastErrorMessage) ? "no reason reported" : lastErrorMessage!.Trim();
                return new WebhookHealthReport(
                    WebhookDiagnosis.DeliveryFailing,
                    $"Telegram cannot deliver updates to {registered}: \"{reason}\" (last failure {Ago(lastErrorUtc!.Value, utcNow)}, "
                    + $"{pendingUpdateCount} update(s) waiting). Check that the address is reachable from outside and register it again if it changed.");
            }

            if (lastErrorUtc.HasValue)
            {
                return new WebhookHealthReport(
                    WebhookDiagnosis.PastErrors,
                    $"Telegram webhook is registered at {registered} and answers. The last delivery failure was "
                    + $"{Ago(lastErrorUtc.Value, utcNow)} and nothing is waiting in the queue, so it is history rather than a problem.");
            }

            return new WebhookHealthReport(
                WebhookDiagnosis.Ok,
                $"Telegram webhook is registered at {registered}, answers, and reports no delivery failures.");
        }

        /// <summary>Тот же ли это адрес с точки зрения Telegram.</summary>
        private static bool SameEndpoint(string left, string right)
        {
            if (!Uri.TryCreate(left, UriKind.Absolute, out var leftUri) ||
                !Uri.TryCreate(right, UriKind.Absolute, out var rightUri))
            {
                return string.Equals(left, right, StringComparison.OrdinalIgnoreCase);
            }

            return Uri.Compare(
                leftUri,
                rightUri,
                UriComponents.SchemeAndServer | UriComponents.PathAndQuery,
                UriFormat.SafeUnescaped,
                StringComparison.OrdinalIgnoreCase) == 0;
        }

        private static string Ago(DateTime momentUtc, DateTime utcNow)
        {
            var elapsed = utcNow - momentUtc;
            if (elapsed < TimeSpan.Zero)
            {
                // Часы контейнера и Telegram могут разойтись на секунды; «через 3 секунды»
                // в логе выглядит как ошибка чтения, а не как расхождение часов.
                return "just now";
            }
            if (elapsed < TimeSpan.FromMinutes(1))
            {
                return $"{(int)elapsed.TotalSeconds}s ago";
            }
            if (elapsed < TimeSpan.FromHours(1))
            {
                return $"{(int)elapsed.TotalMinutes}m ago";
            }
            if (elapsed < TimeSpan.FromDays(1))
            {
                return $"{(int)elapsed.TotalHours}h ago";
            }
            return $"{(int)elapsed.TotalDays}d ago";
        }
    }
}
