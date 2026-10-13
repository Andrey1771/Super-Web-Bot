using System.Net.Sockets;
using System.Security.Authentication;
using Stripe;

namespace SuperBot.WebApi.Services
{
    /// <summary>
    /// Отличает «до платёжного провайдера не достучались» от настоящей поломки сервиса.
    ///
    /// Обе ситуации приходили в обработчик одинаково — непойманным исключением, — и обе давали
    /// 500 плюс полную простыню стека в логе. Но это разные вещи: недоступный Stripe не значит,
    /// что сломан магазин, и чинится он не в коде. Раз это штатное состояние, ему полагается
    /// свой статус (503) и одна строка в логе: иначе каждое открытие кабинета печатает два
    /// стека, а в них тонет то, что действительно требует внимания.
    ///
    /// Признак — сетевой сбой, а не ответ Stripe: TLS не установился, сокет закрылся, вышло
    /// время. Отказ самого Stripe (неверный ключ, отклонённая операция) сюда не попадает —
    /// это уже наша ошибка, и прятать её за «сервис недоступен» нельзя.
    /// </summary>
    public static class PaymentProviderOutage
    {
        /// <summary>Пути, где обращение наружу идёт именно к платёжному провайдеру.</summary>
        private static readonly string[] PaymentPaths = ["/api/billing", "/api/payments"];

        public static bool IsPaymentPath(PathString path) =>
            PaymentPaths.Any(prefix => path.StartsWithSegments(prefix, StringComparison.OrdinalIgnoreCase));

        /// <summary>
        /// Сетевой сбой при обращении к провайдеру. Разбираем всю цепочку Inner: SDK Stripe
        /// отдаёт то <see cref="StripeException"/> с сетевой причиной внутри, то сырое
        /// <see cref="HttpRequestException"/> — зависит от того, где именно оборвалось.
        /// </summary>
        public static bool IsUnreachable(Exception? exception)
        {
            for (var current = exception; current != null; current = current.InnerException)
            {
                // StripeError заполнен — Stripe ответил, и это его отказ, а не обрыв связи.
                if (current is StripeException { StripeError: not null })
                {
                    return false;
                }

                if (current is HttpRequestException
                    or SocketException
                    or AuthenticationException
                    or TimeoutException
                    or TaskCanceledException
                    or OperationCanceledException)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>Короткая причина для лога: самое внутреннее сообщение всегда конкретнее внешнего.</summary>
        public static string DescribeReason(Exception exception)
        {
            var innermost = exception;
            while (innermost.InnerException != null)
            {
                innermost = innermost.InnerException;
            }

            return innermost.Message;
        }
    }
}
