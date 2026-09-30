namespace SuperBot.WebApi.Services;

/// <summary>Грубая проверка «это почта, а не логин или sub»: решает, можно ли слать письмо по этому ключу.</summary>
public static class EmailAddress
{
    public static bool LooksLikeEmail(string? value) =>
        !string.IsNullOrWhiteSpace(value) && value.Contains('@') && value.Contains('.');
}
