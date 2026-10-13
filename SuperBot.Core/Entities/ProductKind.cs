namespace SuperBot.Core.Entities
{
    /// <summary>
    /// Вид товара в каталоге. Каталог исторически называется «игры» (Game, GameDetails, GameKey), и ПО живёт в нём же:
    /// склад ключей, цены, скидки, регионы, корзина, заказы и кэшбэк у обоих видов общие. Вид решает, как товар
    /// показывается (раздел, страница, фильтры), какие проверки карточки к нему применимы и каким налоговым кодом он облагается.
    /// </summary>
    public enum ProductKind
    {
        /// <summary>Значение по умолчанию: у документов, заведённых до появления поля, его нет — они игры.</summary>
        Game = 0,
        Software = 1
    }

    /// <summary>
    /// Тип строки заказа (<c>OrderItemSnapshot.ProductType</c>, <c>CheckoutLineItem.ProductType</c>). Строкой, а не
    /// перечислением: так поле хранилось всегда, и у старых заказов там «Game». Подписка — отдельный тип, потому что
    /// налоговый код у неё свой.
    /// </summary>
    public static class ProductTypes
    {
        public const string Game = "Game";
        public const string Software = "Software";
        public const string SoftwareSubscription = "SoftwareSubscription";

        /// <summary>Тип строки для товара этого вида и выбранного издания (лицензии).</summary>
        public static string For(ProductKind kind, GameEdition? edition) =>
            kind == ProductKind.Software
                ? edition?.IsSubscription == true ? SoftwareSubscription : Software
                : Game;

        public static bool IsSoftware(string? productType) =>
            string.Equals(productType, Software, StringComparison.OrdinalIgnoreCase)
            || string.Equals(productType, SoftwareSubscription, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Где активируется ключ ПО — от этого зависит инструкция на странице товара и в кабинете.
    /// В JSON — именем («MicrosoftAccount»), с приёмом и чисел: редактор карточки шлёт имя, а по умолчанию
    /// System.Text.Json принимал только число и отвечал 400 на любую смену места активации.
    /// </summary>
    [System.Text.Json.Serialization.JsonConverter(typeof(System.Text.Json.Serialization.JsonStringEnumConverter))]
    public enum SoftwareActivationTarget
    {
        /// <summary>На сайте производителя (личный кабинет вендора).</summary>
        VendorWebsite = 0,
        /// <summary>Учётная запись Microsoft (Windows, Office, Microsoft 365).</summary>
        MicrosoftAccount = 1,
        /// <summary>Прямо в приложении после установки.</summary>
        InApp = 2
    }

    /// <summary>Активация ключа ПО. У игр не используется — там площадка задаётся типом ключа (Steam и т. п.).</summary>
    public class SoftwareActivation
    {
        public SoftwareActivationTarget Target { get; set; } = SoftwareActivationTarget.VendorWebsite;
        /// <summary>Куда идти активировать, например страница лицензий производителя. Необязательно.</summary>
        public string? Url { get; set; }
        /// <summary>Как назвать место активации покупателю, например «Nova account». Пусто — по <see cref="Target"/>.</summary>
        public string? Label { get; set; }
        /// <summary>Переводы подписи места активации (ru/uk/pl).</summary>
        public Dictionary<string, string>? LabelI18n { get; set; }
    }

    /// <summary>Лицензии и категории ПО: значения по умолчанию и человекочитаемые подписи.</summary>
    public static class SoftwareCatalog
    {
        /// <summary>
        /// Категории софта по умолчанию. Хранятся в настройках (Settings.SoftwareCategories), чтобы добавлять
        /// и переименовывать их без выкладки; этот список только засевает пустые настройки. Tag — адрес категории.
        /// </summary>
        public static IReadOnlyList<GameCategory> DefaultCategories { get; } = new[]
        {
            new GameCategory { Tag = "operating-systems", Title = "Operating systems" },
            new GameCategory { Tag = "office", Title = "Office" },
            new GameCategory { Tag = "security", Title = "Antivirus & security" },
            new GameCategory { Tag = "vpn", Title = "VPN & privacy" },
            new GameCategory { Tag = "design", Title = "Design & video" },
            new GameCategory { Tag = "utilities", Title = "Utilities" },
        };

        /// <summary>
        /// Подпись лицензии: «1 year · 3 devices», «Lifetime · 1 PC», «Subscription · 1 month». null — у издания нет полей
        /// лицензии (игровое издание или ПО без вариантов).
        /// </summary>
        public static string? LicenseLabel(GameEdition? edition)
        {
            if (edition is null || (edition.LicenseTermMonths is null && edition.LicenseDevices is null && !edition.IsSubscription))
            {
                return null;
            }

            var term = TermLabel(edition.LicenseTermMonths, edition.IsSubscription);
            var devices = edition.LicenseDevices is { } count and > 0
                ? $"{count} {(count == 1 ? "device" : "devices")}"
                : null;
            return string.Join(" · ", new[] { term, devices }.Where(part => !string.IsNullOrEmpty(part)));
        }

        /// <summary>Значение фильтра «срок лицензии»: число месяцев строкой («12») или «lifetime». У подписки без срока — null.</summary>
        public static string? TermKey(int? months, bool subscription) =>
            months is > 0 ? months.Value.ToString(System.Globalization.CultureInfo.InvariantCulture) : subscription ? null : LifetimeTerm;

        public const string LifetimeTerm = "lifetime";

        /// <summary>С этого числа устройства фильтр объединяет в одну кнопку «10+»: семейные и офисные пакеты различать не нужно.</summary>
        public const int ManyDevices = 10;

        /// <summary>Значение фильтра «устройства»: «1», «3», «10+». Без числа устройств — null.</summary>
        public static string? DevicesKey(int? devices) =>
            devices is not > 0 ? null : devices >= ManyDevices ? $"{ManyDevices}+" : devices.Value.ToString(System.Globalization.CultureInfo.InvariantCulture);

        /// <summary>
        /// Системы, на которых работает ПО, — для карточки и фильтра «Works on». У игр платформы считаются по ключам
        /// (Steam → PC), у ПО ключ вендорский и о системе ничего не говорит, поэтому берём из карточки.
        /// </summary>
        public static string[] OsLabels(GamePlatforms? platforms)
        {
            var labels = new List<string>();
            if (platforms?.Windows == true) labels.Add("Windows");
            if (platforms?.Mac == true) labels.Add("macOS");
            if (platforms?.Linux == true) labels.Add("Linux");
            if (platforms?.Android == true) labels.Add("Android");
            if (platforms?.Ios == true) labels.Add("iOS");
            return labels.ToArray();
        }

        /// <summary>«1 month», «1 year», «18 months», «Lifetime»; у подписки — с пометкой «Subscription».</summary>
        public static string? TermLabel(int? months, bool subscription)
        {
            string? term = months switch
            {
                null or <= 0 => subscription ? null : "Lifetime",
                1 => "1 month",
                var m when m % 12 == 0 => m == 12 ? "1 year" : $"{m / 12} years",
                var m => $"{m} months"
            };
            return subscription ? term is null ? "Subscription" : $"Subscription · {term}" : term;
        }
    }
}
