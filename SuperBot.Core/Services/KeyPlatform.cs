namespace SuperBot.Core.Services;

/// <summary>
/// Какой платформе принадлежит ключ.
///
/// Тип ключа админ вводит руками («Steam Key», «Xbox Game Pass», «PSN RU»), поэтому
/// разбираем его по ключевым словам, а не по точному совпадению: список магазинов
/// пополняется, и заставлять админа писать строку символ в символ — верный способ
/// однажды получить игру без иконки платформы.
/// </summary>
public static class KeyPlatform
{
    public const string Pc = "PC";
    public const string Xbox = "Xbox";
    public const string PlayStation = "PlayStation";
    public const string Nintendo = "Nintendo";

    /// <summary>
    /// Слова-приметы в порядке проверки. Консоли идут первыми: «Xbox Play Anywhere»
    /// содержит и «play», и «xbox», и это всё-таки Xbox.
    /// </summary>
    private static readonly (string Marker, string Platform)[] Markers =
    [
        ("xbox", Xbox),
        ("microsoft store", Xbox),
        ("game pass", Xbox),
        ("playstation", PlayStation),
        ("psn", PlayStation),
        ("ps4", PlayStation),
        ("ps5", PlayStation),
        ("nintendo", Nintendo),
        ("switch", Nintendo)
    ];

    /// <summary>
    /// Платформа по типу ключа. Незнакомый тип считаем ключом для ПК: магазин исторически
    /// PC-first, и «неизвестно» здесь почти всегда означает очередной лаунчер для ПК.
    /// </summary>
    public static string FromKeyType(string? keyType)
    {
        if (string.IsNullOrWhiteSpace(keyType))
        {
            return Pc;
        }

        var normalized = keyType.ToLowerInvariant();
        foreach (var (marker, platform) in Markers)
        {
            if (normalized.Contains(marker, StringComparison.Ordinal))
            {
                return platform;
            }
        }

        return Pc;
    }
}
