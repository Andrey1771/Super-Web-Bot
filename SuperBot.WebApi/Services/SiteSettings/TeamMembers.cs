using System.Text.Json;
using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Services.SiteSettings;

/// <summary>
/// Люди на странице «О нас».
///
/// Раньше четверо были вписаны прямо в разметку витрины — Alex Carter, Jamie Lee и ещё двое,
/// которых не существует. Выдуманные сотрудники хуже выдуманных цифр: это утверждение о
/// конкретных людях. Поэтому список пуст по умолчанию и заполняется из админки: пока в нём
/// никого нет, раздел на странице не рисуется вовсе.
///
/// Хранится JSON-строкой в общем документе настроек — тем же способом, что справочник
/// регионов активации: отдельная коллекция ради списка из двух-трёх строк не нужна, а
/// редактируется он там же, в «Settings».
/// </summary>
public sealed class TeamMember
{
    /// <summary>Имя. Пустое имя делает карточку бессмысленной — такие строки отбрасываются.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Чем занимается: «Founder», «Support». Может быть пустым.</summary>
    public string Role { get; set; } = string.Empty;

    /// <summary>Короткая подпись под именем. Может быть пустой.</summary>
    public string Description { get; set; } = string.Empty;

    /// <summary>Ярлык категории слева сверху карточки («Support», «Operations»).</summary>
    public string Badge { get; set; } = string.Empty;

    /// <summary>Переводы роли, подписи и ярлыка (ru/uk/pl → текст); английское поле — основное. Имя не переводится.</summary>
    public Dictionary<string, string>? RoleI18n { get; set; }
    public Dictionary<string, string>? DescriptionI18n { get; set; }
    public Dictionary<string, string>? BadgeI18n { get; set; }

    /// <summary>
    /// Фотография. Адрес файла из медиатеки — тот же, что у обложек игр: либо путь от корня
    /// («/uploads/images/…»), либо внешний http(s). Пусто — карточка покажет кружок с первой
    /// буквой имени; это законное состояние, фото есть не у всех.
    /// </summary>
    public string PhotoUrl { get; set; } = string.Empty;
}

public static class TeamMembers
{
    /// <summary>Сколько человек имеет смысл показывать. Больше — уже не «команда», а штатное расписание.</summary>
    public const int MaxMembers = 12;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// Разбор сохранённого списка. Битый JSON — не повод ронять страницу «О нас»:
    /// возвращаем пустой список, и раздел просто не покажется.
    /// </summary>
    public static IReadOnlyList<TeamMember> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<TeamMember>();
        }

        try
        {
            return Normalize(JsonSerializer.Deserialize<List<TeamMember>>(json, Json));
        }
        catch (JsonException)
        {
            return Array.Empty<TeamMember>();
        }
    }

    /// <summary>
    /// Приводит список к тому, что можно показывать: без пустых имён, без лишних пробелов,
    /// не длиннее <see cref="MaxMembers"/>.
    /// </summary>
    public static IReadOnlyList<TeamMember> Normalize(IEnumerable<TeamMember>? members)
    {
        if (members is null)
        {
            return Array.Empty<TeamMember>();
        }

        return members
            .Where(member => member is not null && !string.IsNullOrWhiteSpace(member.Name))
            .Select(member => new TeamMember
            {
                Name = member.Name.Trim(),
                Role = (member.Role ?? string.Empty).Trim(),
                Description = (member.Description ?? string.Empty).Trim(),
                Badge = (member.Badge ?? string.Empty).Trim(),
                RoleI18n = Localized.Normalize(member.RoleI18n),
                DescriptionI18n = Localized.Normalize(member.DescriptionI18n),
                BadgeI18n = Localized.Normalize(member.BadgeI18n),
                PhotoUrl = SafePhotoUrl(member.PhotoUrl),
            })
            .Take(MaxMembers)
            .ToList();
    }

    /// <summary>
    /// Список для витрины на языке покупателя: роль, подпись и ярлык подменяются переводами, словари
    /// переводов наружу не уходят. Нет перевода — английский текст.
    /// </summary>
    public static IReadOnlyList<TeamMember> Localize(IEnumerable<TeamMember> members, string? locale)
    {
        var code = BuyerLanguage.Normalize(locale);
        return members
            .Select(member => new TeamMember
            {
                Name = member.Name,
                Role = Localized.Pick(member.RoleI18n, code, member.Role) ?? string.Empty,
                Description = Localized.Pick(member.DescriptionI18n, code, member.Description) ?? string.Empty,
                Badge = Localized.Pick(member.BadgeI18n, code, member.Badge) ?? string.Empty,
                PhotoUrl = member.PhotoUrl,
            })
            .ToList();
    }

    /// <summary>
    /// Адрес фотографии, пригодный для <c>&lt;img src&gt;</c> на публичной странице: путь от
    /// корня сайта или внешний http(s). Всё остальное — «javascript:», «data:», «file:» и
    /// просто мусор — превращается в пустоту, и карточка честно покажет букву. Проверка
    /// живёт здесь, а не в админке: настройки правит человек, но хранилище общее, и
    /// страница «О нас» не должна зависеть от того, что в него положили.
    /// </summary>
    private static string SafePhotoUrl(string? value)
    {
        var url = (value ?? string.Empty).Trim();
        if (url.Length == 0)
        {
            return string.Empty;
        }

        // «//host/path» — это протокол-относительный адрес, а не путь от корня.
        if (url.StartsWith("/", StringComparison.Ordinal) && !url.StartsWith("//", StringComparison.Ordinal))
        {
            return url;
        }

        return Uri.TryCreate(url, UriKind.Absolute, out var parsed)
            && (parsed.Scheme == Uri.UriSchemeHttp || parsed.Scheme == Uri.UriSchemeHttps)
                ? url
                : string.Empty;
    }

    public static string Serialize(IEnumerable<TeamMember>? members) =>
        JsonSerializer.Serialize(Normalize(members), Json);
}
