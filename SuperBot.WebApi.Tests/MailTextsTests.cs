using SuperBot.WebApi.Mail;
using SuperBot.WebApi.Services;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>Словарь писем: все языки покрывают те же ключи, что английский, и тексты собираются на языке покупателя.</summary>
public class MailTextsTests
{
    private static string Stem(string key) =>
        key.EndsWith("_one") || key.EndsWith("_few") || key.EndsWith("_many") || key.EndsWith("_other")
            ? key[..key.LastIndexOf('_')]
            : key;

    [Fact]
    public void Every_language_has_the_same_keys_as_english()
    {
        var english = MailTexts.All["en"].Keys.Select(Stem).ToHashSet();
        foreach (var (locale, strings) in MailTexts.All)
        {
            var keys = strings.Keys.Select(Stem).ToHashSet();
            Assert.True(english.SetEquals(keys),
                $"{locale}: missing [{string.Join(", ", english.Except(keys))}], extra [{string.Join(", ", keys.Except(english))}]");
            // Подстановки на месте: {0} из английской строки есть и в переводе.
            foreach (var (key, value) in strings)
            {
                var stem = Stem(key);
                var reference = MailTexts.All["en"].FirstOrDefault(pair => Stem(pair.Key) == stem).Value ?? string.Empty;
                for (var i = 0; i < 4; i++)
                {
                    var placeholder = "{" + i + "}";
                    if (reference.Contains(placeholder))
                    {
                        Assert.True(value.Contains(placeholder), $"{locale}:{key} lost {placeholder}");
                    }
                }
            }
        }
    }

    [Fact]
    public void Texts_follow_the_locale_and_fall_back_to_english()
    {
        Assert.Equal("Your keys — order TS-1", MailTexts.For(null).F("keys.subject", "TS-1"));
        Assert.Equal("Ваши ключи — заказ TS-1", MailTexts.For("ru").F("keys.subject", "TS-1"));
        Assert.Equal("Ваші ключі — замовлення TS-1", MailTexts.For("uk-UA").F("keys.subject", "TS-1"));
        Assert.Equal("Twoje klucze — zamówienie TS-1", MailTexts.For("pl").F("keys.subject", "TS-1"));
        // Незнакомый язык — английский.
        Assert.Equal("en", MailTexts.For("de").Locale);
    }

    [Fact]
    public void Plurals_and_dates_use_the_language_rules()
    {
        Assert.Equal("1 of 1 key", MailTexts.For("en").N("keys.progress", 1, 1));
        Assert.Equal("2 of 5 keys", MailTexts.For("en").N("keys.progress", 5, 2));
        Assert.Equal("1 из 1 ключа", MailTexts.For("ru").N("keys.progress", 1, 1));
        Assert.Equal("2 из 3 ключей", MailTexts.For("ru").N("keys.progress", 3, 2));
        Assert.Equal("1 z 22 kluczy", MailTexts.For("pl").N("keys.progress", 22, 1));

        var date = new DateTime(2026, 10, 14, 0, 0, 0, DateTimeKind.Utc);
        Assert.Equal("14 October 2026", MailTexts.For("en").Date(date));
        Assert.Equal("14 октября 2026", MailTexts.For("ru").Date(date));
        Assert.Equal("14 жовтня 2026", MailTexts.For("uk").Date(date));
        Assert.Equal("14 października 2026", MailTexts.For("pl").Date(date));
    }

    [Theory]
    [InlineData("ru-RU,ru;q=0.9,en-US;q=0.8", "ru")]
    [InlineData("uk", "uk")]
    [InlineData("PL-pl", "pl")]
    [InlineData("de-DE,de;q=0.9,en;q=0.5", "en")]
    [InlineData("de", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void Buyer_language_takes_the_first_supported_tag(string? header, string? expected)
    {
        Assert.Equal(expected, BuyerLanguage.Parse(header));
    }
}
