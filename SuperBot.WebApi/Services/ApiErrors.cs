using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Тело ошибки API для витрины: код, по которому фронт берёт текст из своего словаря на языке
/// покупателя, английское сообщение как запас (старый клиент, админка, логи) и подстановки
/// для текста («{{title}}», «{{max}}»). Сериализуется как {code, message, args}.
/// </summary>
public sealed record ApiErrorBody(string Code, string Message, object? Args = null);

public static class ApiErrors
{
    public static ApiErrorBody Body(string code, string message, object? args = null) => new(code, message, args);

    /// <summary>
    /// ProblemDetails с кодом: тот же ответ, что у <c>Problem(detail, statusCode)</c>, плюс поля
    /// <c>code</c> и <c>args</c> на верхнем уровне — фронт читает их так же, как у обычного тела ошибки.
    /// </summary>
    public static ObjectResult ApiProblem(this ControllerBase controller, string message, int statusCode, string? code = null, object? args = null)
    {
        var details = new ProblemDetails
        {
            Title = ReasonPhrases.GetReasonPhrase(statusCode),
            Detail = message,
            Status = statusCode
        };
        details.Extensions["traceId"] = controller.HttpContext?.TraceIdentifier;
        if (code is not null)
        {
            details.Extensions["code"] = code;
        }
        if (args is not null)
        {
            details.Extensions["args"] = args;
        }
        return new ObjectResult(details) { StatusCode = statusCode };
    }
}
