using System;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Security.Authentication;
using Microsoft.AspNetCore.Http;
using Stripe;
using SuperBot.WebApi.Services;
using Xunit;

namespace SuperBot.WebApi.Tests
{
    /// <summary>
    /// Отличаем «до Stripe не достучались» от настоящей поломки.
    ///
    /// Цена ошибки в обе стороны разная. Принять сбой связи за поломку — это 500 и стек в логе
    /// на каждое открытие кабинета, в которых тонет всё остальное. Принять поломку за сбой
    /// связи — хуже: наша ошибка в платежах спрячется за вежливым «сервис временно недоступен»,
    /// и никто её не увидит.
    /// </summary>
    public class PaymentProviderOutageTests
    {
        [Fact]
        public void BrokenTlsHandshake_isAnOutage()
        {
            // Ровно то, что приходит, когда api.stripe.com режется по дороге.
            var exception = new HttpRequestException(
                "The SSL connection could not be established, see inner exception.",
                new AuthenticationException("Received an unexpected EOF or 0 bytes from the transport stream."));

            Assert.True(PaymentProviderOutage.IsUnreachable(exception));
        }

        [Fact]
        public void ClosedSocket_isAnOutage()
        {
            Assert.True(PaymentProviderOutage.IsUnreachable(new SocketException(10061)));
        }

        [Fact]
        public void Timeout_isAnOutage()
        {
            Assert.True(PaymentProviderOutage.IsUnreachable(new TaskCanceledException("The request was canceled due to the configured HttpClient.Timeout")));
        }

        [Fact]
        public void NetworkFailureBuriedInTheChain_isAnOutage()
        {
            // Причина может лежать не первой: разбираем цепочку целиком, а не верхний тип.
            var exception = new InvalidOperationException("outer", new HttpRequestException("connection refused"));

            Assert.True(PaymentProviderOutage.IsUnreachable(exception));
        }

        [Fact]
        public void StripeAnsweredWithAnError_isNotAnOutage()
        {
            // Stripe ответил — значит связь есть, а виноваты мы: неверный ключ, отклонённая
            // операция. Прятать это за «сервис временно недоступен» нельзя.
            var exception = new StripeException(
                HttpStatusCode.Unauthorized,
                new StripeError { Message = "Invalid API Key provided" },
                "Invalid API Key provided");

            Assert.False(PaymentProviderOutage.IsUnreachable(exception));
        }

        [Fact]
        public void StripeExceptionWithoutACause_isNotAnOutage()
        {
            // Тип от SDK сам по себе ничего не доказывает: если внутри нет сетевого сбоя,
            // считаем это своей ошибкой. Ошибиться в эту сторону дешевле — лишний стек в
            // логе заметят, а спрятанную поломку платежей нет.
            Assert.False(PaymentProviderOutage.IsUnreachable(new StripeException("Something went wrong")));
        }

        [Fact]
        public void OrdinaryBug_isNotAnOutage()
        {
            Assert.False(PaymentProviderOutage.IsUnreachable(new NullReferenceException()));
            Assert.False(PaymentProviderOutage.IsUnreachable(null));
        }

        [Theory]
        [InlineData("/api/billing/payment-methods", true)]
        [InlineData("/api/payments/confirm-payment-intent", true)]
        [InlineData("/API/Billing/profile", true)]
        [InlineData("/api/game/catalog", false)]
        [InlineData("/api/billingsomethingelse", false)]
        public void OnlyPaymentPathsCount(string path, bool expected)
        {
            // Обрыв связи бывает и в других местах — там он остаётся обычной ошибкой сервера,
            // а не «платёжный провайдер недоступен».
            Assert.Equal(expected, PaymentProviderOutage.IsPaymentPath(new PathString(path)));
        }

        [Fact]
        public void ReasonForTheLog_isTheInnermostMessage()
        {
            var exception = new HttpRequestException(
                "The SSL connection could not be established, see inner exception.",
                new AuthenticationException("Received an unexpected EOF or 0 bytes from the transport stream."));

            // Внешнее сообщение отсылает к причине, а причина — во внутреннем: в одну строку
            // лога должна попасть именно она.
            Assert.Equal(
                "Received an unexpected EOF or 0 bytes from the transport stream.",
                PaymentProviderOutage.DescribeReason(exception));
        }
    }
}
