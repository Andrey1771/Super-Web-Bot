using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Services.SiteSettings;

/// <summary>
/// Реквизиты продавца и юридические параметры магазина.
///
/// Раньше это были константы в коде витрины: чтобы сменить название юрлица или адрес, нужно
/// было править исходник и пересобирать фронт. Теперь значения живут в конфигурации сервера —
/// секция "Legal" в appsettings, любое поле перекрывается переменной окружения вида
/// Legal__Entity (двойное подчёркивание — разделитель уровней у ASP.NET).
///
/// Незаполненное поле — не ошибка конфигурации, а состояние «ещё не решили»: витрина покажет
/// на его месте видную метку и вернёт документам пометку «черновик».
///
/// Переводы живут там же, в конфиге: секция Legal:I18n:&lt;язык&gt;:&lt;Поле&gt; (переменная окружения
/// Legal__I18n__ru__DisputeForum). Английские значения — основные; поле без перевода витрина
/// показывает по-английски. Название юрлица, номер, адрес и почты по смыслу не переводятся.
/// </summary>
public class LegalOptions
{
    /// <summary>Название юрлица или ИП, от имени которого идёт продажа.</summary>
    public string Entity { get; set; } = string.Empty;

    /// <summary>Страна регистрации продавца.</summary>
    public string RegistrationCountry { get; set; } = string.Empty;

    /// <summary>Регистрационный номер в реестре страны регистрации.</summary>
    public string RegistrationNumber { get; set; } = string.Empty;

    /// <summary>Юридический адрес.</summary>
    public string Address { get; set; } = string.Empty;

    /// <summary>Почта поддержки — по вопросам заказов.</summary>
    public string SupportEmail { get; set; } = string.Empty;

    /// <summary>Почта для запросов о персональных данных.</summary>
    public string PrivacyEmail { get; set; } = string.Empty;

    /// <summary>Право какой страны применяется к условиям продажи.</summary>
    public string GoverningLawCountry { get; set; } = string.Empty;

    /// <summary>Суд или арбитраж и схема досудебного урегулирования.</summary>
    public string DisputeForum { get; set; } = string.Empty;

    /// <summary>Формулировка отказа от права возврата, если закон требует особой.</summary>
    public string WithdrawalWording { get; set; } = string.Empty;

    /// <summary>Пределы ответственности, разрешённые применимым правом.</summary>
    public string LiabilityLimits { get; set; } = string.Empty;

    /// <summary>Ответственный за персональные данные (или явное «не назначен»).</summary>
    public string DataProtectionOfficer { get; set; } = string.Empty;

    /// <summary>Надзорный орган, куда можно пожаловаться на обработку данных.</summary>
    public string SupervisoryAuthority { get; set; } = string.Empty;

    /// <summary>Срок ответа на запросы о персональных данных.</summary>
    public string DataRequestDays { get; set; } = string.Empty;

    /// <summary>Платёжный провайдер: название и страна.</summary>
    public string PaymentProvider { get; set; } = string.Empty;

    /// <summary>Провайдер авторизации: название и страна.</summary>
    public string IdentityProvider { get; set; } = string.Empty;

    /// <summary>Почтовый провайдер: название и страна.</summary>
    public string EmailProvider { get; set; } = string.Empty;

    /// <summary>Хостинг: название и страна.</summary>
    public string HostingProvider { get; set; } = string.Empty;

    /// <summary>Передаются ли данные за пределы страны и на каком основании.</summary>
    public string DataTransfers { get; set; } = string.Empty;

    /// <summary>Сколько хранятся заказы — срок из требований бухучёта.</summary>
    public string OrderRetention { get; set; } = string.Empty;

    /// <summary>Сколько данные аккаунта живут после его удаления.</summary>
    public string AccountRetention { get; set; } = string.Empty;

    /// <summary>Сколько хранятся переписки с поддержкой.</summary>
    public string SupportRetention { get; set; } = string.Empty;

    /// <summary>Срок хранения, настроенный в аналитическом аккаунте.</summary>
    public string AnalyticsRetention { get; set; } = string.Empty;

    /// <summary>Дата, с которой действуют документы. Показывается в их шапке.</summary>
    public string EffectiveDate { get; set; } = string.Empty;

    /// <summary>
    /// Принудительная пометка «черновик». Ставьте true, пока текст не вычитал юрист: витрина
    /// покажет предупреждение, даже если все поля заполнены. Незаполненное поле включает
    /// пометку само, независимо от этого флага.
    /// </summary>
    public bool Draft { get; set; } = true;

    /// <summary>Переводы: язык сайта (ru/uk/pl) → имя поля → текст.</summary>
    public Dictionary<string, Dictionary<string, string>> I18n { get; set; } = new();

    /// <summary>Значение поля на языке покупателя; нет перевода — английское. Язык и имя поля — без учёта регистра.</summary>
    public string Text(string field, string english, string? language)
    {
        var code = BuyerLanguage.Normalize(language);
        if (code is null || code == "en" || Array.IndexOf(Localized.Languages, code) < 0)
        {
            return english;
        }
        var texts = I18n.FirstOrDefault(pair => string.Equals(pair.Key, code, StringComparison.OrdinalIgnoreCase)).Value;
        var text = texts?.FirstOrDefault(pair => string.Equals(pair.Key, field, StringComparison.OrdinalIgnoreCase)).Value;
        return string.IsNullOrWhiteSpace(text) ? english : text.Trim();
    }
}
