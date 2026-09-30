namespace SuperBot.Core.Regions
{
    /// <summary>
    /// Где активируется ключ. Два режима:
    /// <list type="bullet">
    /// <item><c>Global</c> — работает везде, кроме <see cref="ExcludedCountries"/> (типично: RU, BY, CN);</item>
    /// <item><c>Regions</c> — только в перечисленных регионах (EU, NA, CIS…), и тоже с исключениями стран.</item>
    /// </list>
    /// Регион — именованный набор стран из справочника (<see cref="RegionCatalog"/>). Политика есть у игры
    /// (по умолчанию для её ключей) и может быть своей у ключа (партия ключей под другой регион).
    /// </summary>
    public class RegionPolicy
    {
        public const string ModeGlobal = "Global";
        public const string ModeRegions = "Regions";

        public string Mode { get; set; } = ModeGlobal;

        /// <summary>Коды регионов из справочника; имеет смысл только при Mode = Regions.</summary>
        public List<string> Regions { get; set; } = new();

        /// <summary>Страны (ISO-3166-1 alpha-2), где ключ НЕ работает, независимо от режима.</summary>
        public List<string> ExcludedCountries { get; set; } = new();

        public bool IsGlobal => !string.Equals(Mode, ModeRegions, StringComparison.OrdinalIgnoreCase);

        /// <summary>Политика «везде без исключений» — то, что подразумевается у ключей и игр без явной политики.</summary>
        public static RegionPolicy Anywhere() => new();

        public RegionPolicy Normalize()
        {
            Mode = IsGlobal ? ModeGlobal : ModeRegions;
            Regions = (Regions ?? new()).Select(r => r?.Trim().ToUpperInvariant() ?? string.Empty).Where(r => r.Length > 0).Distinct().ToList();
            ExcludedCountries = (ExcludedCountries ?? new()).Select(c => c?.Trim().ToUpperInvariant() ?? string.Empty).Where(c => c.Length == 2).Distinct().ToList();
            return this;
        }

        /// <summary>
        /// Подходит ли ключ с этой политикой покупателю из страны <paramref name="countryCode"/>.
        /// Неизвестная страна (null/пусто) — «не знаем», считаем допустимым: блокировать покупку,
        /// не определив страну, хуже, чем пропустить; жёсткую проверку делает чекаут с известной страной.
        /// </summary>
        public bool Allows(string? countryCode, RegionCatalog catalog)
        {
            if (string.IsNullOrWhiteSpace(countryCode))
            {
                return true;
            }
            var country = countryCode.Trim().ToUpperInvariant();
            if (ExcludedCountries.Any(c => string.Equals(c, country, StringComparison.OrdinalIgnoreCase)))
            {
                return false;
            }
            if (IsGlobal)
            {
                return true;
            }
            return Regions.Any(region => catalog.Contains(region, country));
        }

        /// <summary>Страна покупателя известна, но политика её не пропускает — для чекаута и витрины.</summary>
        public bool Blocks(string? countryCode, RegionCatalog catalog) => !string.IsNullOrWhiteSpace(countryCode) && !Allows(countryCode, catalog);
    }

    /// <summary>Регион справочника: код, имя и страны (ISO alpha-2).</summary>
    public class RegionDefinition
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public List<string> Countries { get; set; } = new();
    }

    /// <summary>Справочник регионов. Дефолтный набор зашит здесь; магазин правит его в настройках сайта.</summary>
    public class RegionCatalog
    {
        public List<RegionDefinition> Regions { get; set; } = Default();

        public RegionDefinition? Find(string code) =>
            Regions.FirstOrDefault(r => string.Equals(r.Code, code, StringComparison.OrdinalIgnoreCase));

        public bool Contains(string regionCode, string countryCode)
        {
            var region = Find(regionCode);
            return region is not null && region.Countries.Any(c => string.Equals(c, countryCode, StringComparison.OrdinalIgnoreCase));
        }

        public string NameOf(string code) => Find(code)?.Name ?? code;

        public static List<RegionDefinition> Default() => new()
        {
            new() { Code = "EU", Name = "Europe", Countries = new() { "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","GB","NO","CH","IS","LI","RS","BA","ME","MK","AL","MD","UA","GE","AM","AZ","XK" } },
            new() { Code = "NA", Name = "North America", Countries = new() { "US","CA","MX" } },
            new() { Code = "LATAM", Name = "Latin America", Countries = new() { "AR","BO","BR","CL","CO","CR","CU","DO","EC","SV","GT","HN","NI","PA","PY","PE","PR","UY","VE" } },
            new() { Code = "CIS", Name = "CIS", Countries = new() { "RU","BY","KZ","KG","UZ","TJ","TM","AM","AZ","MD" } },
            new() { Code = "TR", Name = "Türkiye", Countries = new() { "TR" } },
            new() { Code = "MENA", Name = "Middle East & North Africa", Countries = new() { "AE","SA","QA","KW","BH","OM","IL","JO","LB","EG","MA","DZ","TN","IQ","IR" } },
            new() { Code = "ASIA", Name = "Asia", Countries = new() { "JP","KR","CN","TW","HK","MO","SG","MY","TH","VN","PH","ID","IN","PK","BD","LK","NP","MN","KH","LA","MM" } },
            new() { Code = "OCEANIA", Name = "Oceania", Countries = new() { "AU","NZ" } },
            new() { Code = "AFRICA", Name = "Africa", Countries = new() { "ZA","NG","KE","GH","ET","TZ","UG","SN","CI","CM","ZM","ZW","MZ","AO","NA","BW" } }
        };
    }
}

namespace SuperBot.Core.Regions
{
    /// <summary>Текущий справочник регионов (конфиг + настройки сайта) — для репозиториев и сервисов без доступа к Options.</summary>
    public interface IRegionCatalogProvider
    {
        RegionCatalog Current { get; }
    }
}

namespace SuperBot.Core.Regions
{
    /// <summary>Справочник по умолчанию — для сервисов без настроек сайта (бот), где регионы не правятся.</summary>
    public sealed class DefaultRegionCatalogProvider : IRegionCatalogProvider
    {
        private readonly RegionCatalog _catalog = new();
        public RegionCatalog Current => _catalog;
    }
}
