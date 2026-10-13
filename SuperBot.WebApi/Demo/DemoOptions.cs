namespace SuperBot.WebApi.Demo;

/// <summary>
/// Демо-сайт для портфолио (секция Demo, env Demo__*). Работает как обычный магазин: посетители регистрируются,
/// покупают тестовой картой Stripe и пишут в поддержку. Отличия: общий демо-админ видит всю админку, но ничего
/// не меняет (<see cref="DemoGuard"/>), почты посетителей ему показываются замаскированными, а ключи демо-игр
/// не кончаются (<see cref="DemoKeyTopUpWorker"/>). На обычном магазине выключено и ни на что не влияет.
/// </summary>
public sealed class DemoOptions
{
    public const string SectionName = "Demo";

    public bool Enabled { get; set; }

    /// <summary>
    /// Демо-аккаунты, которые показываются посетителю (окно приглашения, страница входа). Пароли публичные
    /// намеренно. Учётка с ролью admin — «только просмотр»: менять пароль, профиль и данные сайта ей нельзя.
    /// </summary>
    public List<DemoAccount> Accounts { get; set; } = [];

    /// <summary>Сколько ключей держать у каждого товара (и издания): покупки посетителей не должны его распродать.</summary>
    public int KeysPerProduct { get; set; } = 25;

    /// <summary>Как часто доливать ключи до <see cref="KeysPerProduct"/>.</summary>
    public int KeyTopUpMinutes { get; set; } = 60;

    /// <summary>
    /// Домены самого магазина: почты на них демо-админу не маскируются — это адрес поддержки и рассылок, а не посетитель
    /// (иначе «help@…» превращался в «h***@…» и выглядел чьей-то личной почтой). Поддомены тоже свои.
    /// </summary>
    public List<string> OwnEmailDomains { get; set; } = ["tale-shop.com", "taleshop.dev"];
}

public sealed class DemoAccount
{
    /// <summary>admin — демо-админ «только просмотр»; buyer — общий покупатель (сейчас не используется).</summary>
    public string Role { get; set; } = "buyer";
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
}
