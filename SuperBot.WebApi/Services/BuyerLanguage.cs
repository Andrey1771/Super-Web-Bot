namespace SuperBot.WebApi.Services;

/// <summary>
/// Язык покупателя для запроса — из заголовка Accept-Language, который витрина выставляет равным
/// языку сайта (en/ru/uk/pl). Берётся первый поддерживаемый тег; ничего подходящего — null:
/// решать «английский по умолчанию» будет тот, кто пишет письмо, а в заказе останется «неизвестно».
/// </summary>
public static class BuyerLanguage
{
    public static readonly IReadOnlyList<string> Supported = new[] { "en", "ru", "uk", "pl" };

    public static string? Resolve(HttpRequest request) => Parse(request.Headers.AcceptLanguage.ToString());

    /// <summary>«ru-RU,ru;q=0.9,en;q=0.8» → «ru»; «de» → null.</summary>
    public static string? Parse(string? header)
    {
        if (string.IsNullOrWhiteSpace(header))
        {
            return null;
        }

        foreach (var part in header.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var tag = part.Split(';')[0].Trim().ToLowerInvariant();
            if (tag.Length >= 2)
            {
                var code = tag[..2];
                if (Supported.Contains(code))
                {
                    return code;
                }
            }
        }
        return null;
    }

    /// <summary>Хранимое значение → поддерживаемый код или null (старые записи и мусор не ломают письма).</summary>
    public static string? Normalize(string? value) => Parse(value);

    /// <summary>
    /// Язык покупателя по его заказам — язык самого свежего заказа, у которого он записан.
    /// Для писем, у которых заказа под рукой нет (кэшбэк, брошенная корзина).
    /// </summary>
    public static string? FromOrders(IEnumerable<SuperBot.Core.Entities.Order>? orders) =>
        orders?
            .Where(order => !string.IsNullOrWhiteSpace(order.Language))
            .OrderByDescending(order => order.CreatedAt)
            .Select(order => Normalize(order.Language))
            .FirstOrDefault(language => language is not null);
}
