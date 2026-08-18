namespace SuperBot.WebApi.Support.Chat;

/// <summary>
/// Короткий код обращения — хвост идентификатора сессии. Его видит и клиент в виджете,
/// и специалист в списке диалогов: у гостя нет ни почты, ни идентификатора пользователя,
/// и без кода все такие обращения назывались одинаково.
///
/// Сам код нигде не хранится: он выводится из идентификатора на стороне интерфейса. Здесь
/// нужна только обратная задача — понять, что специалист ввёл в поиск код (или целиком
/// идентификатор), а не адрес почты.
/// </summary>
public static class SupportSessionCode
{
    // Идентификатор сессии — ObjectId, то есть 24 шестнадцатеричных символа. Хвост короче
    // четырёх символов не берём: он совпадёт со слишком многими сессиями, и поиск вернёт
    // случайный список вместо конкретного обращения.
    private const int MinFragmentLength = 4;
    private const int MaxFragmentLength = 24;

    /// <summary>
    /// Распознаёт в строке поиска код обращения. Решётка необязательна: специалист
    /// одинаково часто копирует «#7F3A21» из интерфейса и набирает «7f3a21» руками.
    /// </summary>
    public static bool TryParseFragment(string? query, out string fragment)
    {
        fragment = string.Empty;

        if (string.IsNullOrWhiteSpace(query))
        {
            return false;
        }

        var trimmed = query.Trim().TrimStart('#');
        if (trimmed.Length < MinFragmentLength || trimmed.Length > MaxFragmentLength)
        {
            return false;
        }

        foreach (var symbol in trimmed)
        {
            var isHex = symbol is >= '0' and <= '9' or >= 'a' and <= 'f' or >= 'A' and <= 'F';
            if (!isHex)
            {
                return false;
            }
        }

        fragment = trimmed.ToLowerInvariant();
        return true;
    }
}
