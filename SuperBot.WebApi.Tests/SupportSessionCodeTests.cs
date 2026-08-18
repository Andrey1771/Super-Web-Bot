using SuperBot.WebApi.Support.Chat;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Распознавание кода обращения в строке поиска. Ошибка здесь стоит дорого в обе стороны:
/// не узнали код — специалист не находит гостя, о котором тот говорит; приняли за код
/// что-то другое — в выдачу к нужному диалогу подмешиваются посторонние.
/// </summary>
public class SupportSessionCodeTests
{
    [Theory]
    [InlineData("#7f3a21", "7f3a21")]
    [InlineData("7F3A21", "7f3a21")]
    [InlineData("  #7F3A21  ", "7f3a21")]
    [InlineData("507f1f77bcf86cd799439011", "507f1f77bcf86cd799439011")]
    public void Recognises_code_and_full_identifier(string query, string expected)
    {
        Assert.True(SupportSessionCode.TryParseFragment(query, out var fragment));
        Assert.Equal(expected, fragment);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    [InlineData("7f3")] // короче четырёх символов — совпадёт со слишком многими сессиями
    [InlineData("507f1f77bcf86cd7994390111")] // длиннее идентификатора
    [InlineData("guest@taleshop.local")]
    [InlineData("рошоргшгро")]
    [InlineData("7f3a2z")] // z не шестнадцатеричная
    public void Ignores_everything_that_is_not_a_code(string? query)
    {
        Assert.False(SupportSessionCode.TryParseFragment(query, out var fragment));
        Assert.Equal(string.Empty, fragment);
    }
}
