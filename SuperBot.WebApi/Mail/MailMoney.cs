using System.Globalization;

namespace SuperBot.WebApi.Mail;

/// <summary>
/// Сумма в письме — одним правилом для всех писем: ключи, брошенная корзина, кэшбэк. Раньше каждое письмо
/// форматировало само, и одна и та же сумма выглядела в них по-разному («$1234.00» и «$1,234.00»).
/// </summary>
public static class MailMoney
{
    public static string Format(decimal amount, string? currency)
    {
        var code = string.IsNullOrWhiteSpace(currency) ? "USD" : currency.Trim().ToUpperInvariant();
        var symbol = code switch { "USD" => "$", "EUR" => "€", "GBP" => "£", _ => null };
        // У иены и подобных копеек нет: 1 единица = 1 минорная.
        var noCents = SuperBot.Core.Payments.CurrencyMinorUnits.ToMinor(1m, code) == 1;
        var number = amount.ToString(noCents ? "#,0" : "#,0.00", CultureInfo.InvariantCulture);
        return symbol != null ? $"{symbol}{number}" : $"{number} {code}";
    }
}
