namespace SuperBot.WebApi.Services.Checkout;

/// <summary>
/// Текст согласия на немедленную выдачу ключей — здесь и только здесь.
///
/// Витрина не присылает формулировку, а запрашивает её и показывает; сохраняем мы свою копию
/// по номеру версии. Иначе согласие можно было бы подделать, прислав вместе с ним удобный
/// текст, и в заказе осталось бы не то, что человек видел на экране.
///
/// Меняете формулировку — заводите НОВУЮ версию, а старую оставляйте: под ней уже есть заказы,
/// и они должны ссылаться на текст, который показывали тогда.
/// </summary>
public static class DeliveryConsent
{
    /// <summary>Версия, которую показывает витрина сегодня.</summary>
    public const string CurrentVersion = "2026-09-05";

    private static readonly IReadOnlyDictionary<string, string> Texts = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["2026-09-05"] =
            "I ask for my keys to be delivered immediately after payment, and I understand that " +
            "once a key is revealed I can no longer withdraw from this purchase."
    };

    public static string CurrentText => Texts[CurrentVersion];

    /// <summary>Текст известной версии. false — версия неизвестна, согласие принимать нельзя.</summary>
    public static bool TryGetText(string? version, out string text)
    {
        text = string.Empty;
        return !string.IsNullOrWhiteSpace(version) && Texts.TryGetValue(version, out text!);
    }
}
