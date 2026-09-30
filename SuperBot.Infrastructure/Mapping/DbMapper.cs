using Riok.Mapperly.Abstractions;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Mapping;

// Объявления отображений — без аннотаций nullability. Тогда Mapperly считает любой объект
// возможно пустым: отсутствующий вложенный блок (скажем, требования для Mac, которых в базе
// обычно нет, хотя свойство документа объявлено необнуляемым) даёт null, как у AutoMapper,
// а не падение. Помощники для коллекций в конце файла — снова с аннотациями, см. ниже.
#nullable disable

/// <summary>
/// Перенос сущностей в документы Mongo и обратно. Код генерирует Mapperly при сборке — вместо
/// AutoMapper, который с 15-й версии платный и до неё уязвим. Главный выигрыш — вложенные типы:
/// раньше новое вложенное поле без пары в профиле роняло заказ уже после оплаты
/// (см. OrderMappingTests), теперь пара строится сама, а расхождение имён видно предупреждением
/// сборки.
///
/// Пустые коллекции. AutoMapper превращал отсутствующий список (null) в пустой, и код на это
/// полагается — например, JSON из админки с "editions": null. Сгенерированный код по
/// необнуляемому списку прошёл бы без проверки, поэтому для таких типов ниже заданы свои
/// методы: Mapperly сам подставляет их везде, где встречается эта пара типов.
/// </summary>
[Mapper]
public static partial class DbMapper
{
    public static partial AnalyticsSettingsDb ToDb(AnalyticsSettings source);
    public static partial AnalyticsSettings ToEntity(AnalyticsSettingsDb source);

    public static partial BlogPostDb ToDb(BlogPost source);
    public static partial BlogPost ToEntity(BlogPostDb source);
    public static partial BlogPostVersionDb ToDb(BlogPostVersion source);
    public static partial BlogPostVersion ToEntity(BlogPostVersionDb source);
    public static partial BlogEventDb ToDb(BlogEvent source);
    public static partial BlogEvent ToEntity(BlogEventDb source);
    public static partial BlogCommentDb ToDb(BlogComment source);
    public static partial BlogComment ToEntity(BlogCommentDb source);
    public static partial BlogCommentBanDb ToDb(BlogCommentBan source);
    public static partial BlogCommentBan ToEntity(BlogCommentBanDb source);
    public static partial BlogPostUniqueViewDb ToDb(BlogPostUniqueView source);
    public static partial BlogPostUniqueView ToEntity(BlogPostUniqueViewDb source);
    public static partial BlogViewSettingsDb ToDb(BlogViewSettings source);
    public static partial BlogViewSettings ToEntity(BlogViewSettingsDb source);
    public static partial UserBlogProfileDb ToDb(UserBlogProfile source);
    public static partial UserBlogProfile ToEntity(UserBlogProfileDb source);
    public static partial BlogReadingHistoryItemDb ToDb(BlogReadingHistoryItem source);
    public static partial BlogReadingHistoryItem ToEntity(BlogReadingHistoryItemDb source);
    public static partial BlogShownItemDb ToDb(BlogShownItem source);
    public static partial BlogShownItem ToEntity(BlogShownItemDb source);

    public static partial CartGameDb ToDb(CartGame source);
    public static partial CartGame ToEntity(CartGameDb source);
    // Id и UpdatedAt документа корзины ведёт репозиторий, у сущности их нет.
    [MapperIgnoreTarget(nameof(CartDb.Id))]
    [MapperIgnoreTarget(nameof(CartDb.UpdatedAt))]
    public static partial CartDb ToDb(Cart source);
    [MapperIgnoreSource(nameof(CartDb.Id))]
    [MapperIgnoreSource(nameof(CartDb.UpdatedAt))]
    public static partial Cart ToEntity(CartDb source);

    public static partial GameDb ToDb(Game source);
    public static partial Game ToEntity(GameDb source);
    public static partial GameDiscountDb ToDb(GameDiscount source);
    public static partial GameDiscount ToEntity(GameDiscountDb source);

    public static partial GameDetailsDb ToDb(GameDetails source);
    public static partial GameDetails ToEntity(GameDetailsDb source);
    public static partial GameCoverDb ToDb(GameCover source);
    public static partial GameCover ToEntity(GameCoverDb source);
    public static partial GameMediaItemDb ToDb(GameMediaItem source);
    public static partial GameMediaItem ToEntity(GameMediaItemDb source);
    public static partial GameStudioInfoDb ToDb(GameStudioInfo source);
    public static partial GameStudioInfo ToEntity(GameStudioInfoDb source);
    public static partial GamePlatformsDb ToDb(GamePlatforms source);
    public static partial GamePlatforms ToEntity(GamePlatformsDb source);
    public static partial GameLanguageSupportDb ToDb(GameLanguageSupport source);
    public static partial GameLanguageSupport ToEntity(GameLanguageSupportDb source);
    public static partial GameAgeRatingDb ToDb(GameAgeRating source);
    public static partial GameAgeRating ToEntity(GameAgeRatingDb source);
    // Label вычисляется из переводов и в базе не хранится.
    [MapperIgnoreSource(nameof(GameEdition.Label))]
    public static partial GameEditionDb ToDb(GameEdition source);
    public static partial GameEdition ToEntity(GameEditionDb source);
    public static partial SoftwareActivationDb ToDb(SoftwareActivation source);
    public static partial SoftwareActivation ToEntity(SoftwareActivationDb source);
    public static partial GameDlcItemDb ToDb(GameDlcItem source);
    public static partial GameDlcItem ToEntity(GameDlcItemDb source);
    public static partial GameAwardBadgeDb ToDb(GameAwardBadge source);
    public static partial GameAwardBadge ToEntity(GameAwardBadgeDb source);
    public static partial GameSystemRequirementsDb ToDb(GameSystemRequirements source);
    public static partial GameSystemRequirements ToEntity(GameSystemRequirementsDb source);
    public static partial GameSystemRequirementBlockDb ToDb(GameSystemRequirementBlock source);
    public static partial GameSystemRequirementBlock ToEntity(GameSystemRequirementBlockDb source);
    public static partial GameSystemRequirementSpecDb ToDb(GameSystemRequirementSpec source);
    public static partial GameSystemRequirementSpec ToEntity(GameSystemRequirementSpecDb source);
    public static partial GameAutoRecommendRulesDb ToDb(GameAutoRecommendRules source);
    public static partial GameAutoRecommendRules ToEntity(GameAutoRecommendRulesDb source);

    public static partial ImportJobDb ToDb(ImportJob source);
    public static partial ImportJob ToEntity(ImportJobDb source);
    public static partial ImportJobStatsDb ToDb(ImportJobStats source);
    public static partial ImportJobStats ToEntity(ImportJobStatsDb source);
    public static partial ImportIssueDb ToDb(ImportIssue source);
    public static partial ImportIssue ToEntity(ImportIssueDb source);

    public static partial MediaAssetDb ToDb(MediaAsset source);
    public static partial MediaAsset ToEntity(MediaAssetDb source);

    // Вычисляемый признак, в базе не хранится.
    [MapperIgnoreSource(nameof(PromoCode.HasAbsoluteAmounts))]
    public static partial PromoCodeDb ToDb(PromoCode source);
    public static partial PromoCode ToEntity(PromoCodeDb source);
    public static partial PromoCodeUsageDb ToDb(PromoCodeUsage source);
    public static partial PromoCodeUsage ToEntity(PromoCodeUsageDb source);

    public static partial SettingsDb ToDb(Settings source);
    public static partial Settings ToEntity(SettingsDb source);
    public static partial GameCategoryDb ToDb(GameCategory source);
    public static partial GameCategory ToEntity(GameCategoryDb source);

    public static partial SteamOrderDb ToDb(SteamOrder source);
    public static partial SteamOrder ToEntity(SteamOrderDb source);

    // ---- Заказ ----

    public static partial MoneyTotalsDb ToDb(MoneyTotals source);
    public static partial MoneyTotals ToEntity(MoneyTotalsDb source);
    public static partial OrderAttributionDb ToDb(OrderAttribution source);
    public static partial OrderAttribution ToEntity(OrderAttributionDb source);
    public static partial OrderEventDb ToDb(OrderEvent source);
    public static partial OrderEvent ToEntity(OrderEventDb source);
    public static partial OrderTaxDb ToDb(OrderTax source);
    public static partial OrderTax ToEntity(OrderTaxDb source);
    public static partial OrderDisputeDb ToDb(OrderDispute source);
    public static partial OrderDispute ToEntity(OrderDisputeDb source);
    public static partial PricingSnapshotDb ToDb(PricingSnapshot source);
    public static partial PricingSnapshot ToEntity(PricingSnapshotDb source);
    public static partial DeliveredKeyDb ToDb(DeliveredKey source);
    public static partial DeliveredKey ToEntity(DeliveredKeyDb source);
    public static partial DeliverySnapshotDb ToDb(DeliverySnapshot source);
    public static partial DeliverySnapshot ToEntity(DeliverySnapshotDb source);
    public static partial OrderItemSnapshot ToEntity(OrderItemSnapshotDb source);

    /// <summary>Позиция без своего id получает его при записи: по нему работают возвраты по позиции.</summary>
    [UserMapping(Default = true)]
    public static OrderItemSnapshotDb ToDb(OrderItemSnapshot source)
    {
        var target = OrderItemToDbGenerated(source);
        target.ItemId = string.IsNullOrWhiteSpace(source.ItemId) ? Guid.NewGuid().ToString("N") : source.ItemId;
        return target;
    }

    [UserMapping(Default = false)]
    private static partial OrderItemSnapshotDb OrderItemToDbGenerated(OrderItemSnapshot source);

    /// <summary>
    /// Заказ в документ. Id документа — служебный id Mongo (не трогаем), а id заказа живёт в
    /// OrderId строкой. Старые заказы без номера, даты создания или итогов их получают здесь.
    /// </summary>
    [UserMapping(Default = true)]
    public static OrderDb ToDb(Order source)
    {
        var target = OrderToDbGenerated(source);
        var guid = source.OrderGuid == Guid.Empty ? source.Id : source.OrderGuid;
        target.OrderGuid = guid;
        target.UserId = string.IsNullOrWhiteSpace(source.UserId) ? source.UserName : source.UserId;
        target.OrderNumber = string.IsNullOrWhiteSpace(source.OrderNumber)
            ? $"TS-{source.OrderDate:yyyyMMdd}-{guid.ToString("N")[..6].ToUpperInvariant()}"
            : source.OrderNumber;
        target.CreatedAt = source.CreatedAt == default ? source.OrderDate : source.CreatedAt;
        target.Totals = new MoneyTotalsDb
        {
            Subtotal = source.SubtotalAmount ?? source.Totals.Subtotal,
            DiscountTotal = source.DiscountTotal ?? source.Totals.DiscountTotal,
            TaxTotal = source.TaxTotal ?? source.Totals.TaxTotal,
            Total = source.TotalAmount ?? source.Totals.Total
        };
        return target;
    }

    [UserMapping(Default = false)]
    [MapperIgnoreTarget(nameof(OrderDb.Id))]
    [MapProperty(nameof(Order.Id), nameof(OrderDb.OrderId))]
    private static partial OrderDb OrderToDbGenerated(Order source);

    [UserMapping(Default = true)]
    public static Order ToEntity(OrderDb source)
    {
        var target = OrderToEntityGenerated(source);
        target.Id = ParseOrderId(source.OrderId, source.OrderGuid);
        target.OrderGuid = source.OrderGuid == Guid.Empty ? ParseOrderId(source.OrderId, Guid.Empty) : source.OrderGuid;
        target.UserId = string.IsNullOrWhiteSpace(source.UserId) ? source.UserName : source.UserId;
        target.OrderNumber = string.IsNullOrWhiteSpace(source.OrderNumber) ? source.OrderId : source.OrderNumber;
        target.CreatedAt = source.CreatedAt == default ? source.OrderDate : source.CreatedAt;
        target.SubtotalAmount ??= source.Totals.Subtotal;
        target.DiscountTotal ??= source.Totals.DiscountTotal;
        target.TaxTotal ??= source.Totals.TaxTotal;
        target.TotalAmount ??= source.Totals.Total;
        return target;
    }

    [UserMapping(Default = false)]
    [MapperIgnoreTarget(nameof(Order.Id))]
    [MapperIgnoreSource(nameof(OrderDb.Id))]
    [MapperIgnoreSource(nameof(OrderDb.OrderId))]
    private static partial Order OrderToEntityGenerated(OrderDb source);

    private static Guid ParseOrderId(string orderId, Guid fallback)
    {
        if (Guid.TryParse(orderId, out var parsed))
        {
            return parsed;
        }
        return fallback == Guid.Empty ? Guid.NewGuid() : fallback;
    }

    // ---- Пользователь бота: Telegram id в документе хранится строкой ----

    // Name в документе пользователя бота осталось от старой схемы; у сущности его нет.
    [MapProperty(nameof(UserDb.UserId), nameof(User.UserId), Use = nameof(ToTelegramId))]
    [MapperIgnoreSource(nameof(UserDb.Name))]
    public static partial User ToEntity(UserDb source);

    [MapProperty(nameof(User.UserId), nameof(UserDb.UserId), Use = nameof(FromTelegramId))]
    [MapperIgnoreTarget(nameof(UserDb.Name))]
    public static partial UserDb ToDb(User source);

    [UserMapping(Default = false)]
    private static long ToTelegramId(string value) => long.TryParse(value, out var id) ? id : 0;

    [UserMapping(Default = false)]
    private static string FromTelegramId(long value) => value.ToString();

    // ---- Коллекции: null → пустая, как делал AutoMapper ----
    // Типы параметров обязаны совпасть с необнуляемыми свойствами вплоть до аннотации, иначе
    // Mapperly не узнает в методе замену своему обходу. Поэтому здесь аннотации снова включены.
#nullable restore

    private static List<string> CopyList(List<string> source) => source is null ? new() : new(source);

    private static string[] CopyArray(string[] source) => source is null ? Array.Empty<string>() : (string[])source.Clone();

    private static CartGameDb[] MapCartGames(CartGame[] source) => source is null ? Array.Empty<CartGameDb>() : source.Select(ToDb).ToArray();
    private static CartGame[] MapCartGames(CartGameDb[] source) => source is null ? Array.Empty<CartGame>() : source.Select(ToEntity).ToArray();
    private static GameCategoryDb[] MapCategories(GameCategory[] source) => source is null ? Array.Empty<GameCategoryDb>() : source.Select(ToDb).ToArray();
    private static GameCategory[] MapCategories(GameCategoryDb[] source) => source is null ? Array.Empty<GameCategory>() : source.Select(ToEntity).ToArray();

    private static Dictionary<string, string> CopyDictionary(Dictionary<string, string> source) =>
        source is null ? new() : new(source);

    private static Dictionary<string, double> CopyDictionary(Dictionary<string, double> source) =>
        source is null ? new() : new(source);

    private static Dictionary<string, object> CopyDictionary(Dictionary<string, object> source) =>
        source is null ? new() : new(source);

    // ---- Перечисления хранятся строками ----
    // Как у AutoMapper: пустая строка (поля нет в старом документе) — значение по умолчанию,
    // регистр не важен. Сгенерированный Enum.Parse падал бы на таком документе целиком.

    private static ControllerSupport ToControllerSupport(string source) => ParseEnum<ControllerSupport>(source);

    private static GameKeyType ToGameKeyType(string source) => ParseEnum<GameKeyType>(source);

    private static TEnum ParseEnum<TEnum>(string? value)
        where TEnum : struct, Enum =>
        string.IsNullOrWhiteSpace(value) ? default : Enum.Parse<TEnum>(value, ignoreCase: true);

    private static List<TTarget> MapList<TSource, TTarget>(List<TSource>? source, Func<TSource, TTarget> map) =>
        source is null ? new() : source.Select(map).ToList();

    private static List<GameMediaItemDb> MapGallery(List<GameMediaItem> source) => MapList(source, ToDb);
    private static List<GameMediaItem> MapGallery(List<GameMediaItemDb> source) => MapList(source, ToEntity);
    private static List<GameEditionDb> MapEditions(List<GameEdition> source) => MapList(source, ToDb);
    private static List<GameEdition> MapEditions(List<GameEditionDb> source) => MapList(source, ToEntity);
    private static List<GameDlcItemDb> MapDlc(List<GameDlcItem> source) => MapList(source, ToDb);
    private static List<GameDlcItem> MapDlc(List<GameDlcItemDb> source) => MapList(source, ToEntity);
    private static List<GameAwardBadgeDb> MapAwards(List<GameAwardBadge> source) => MapList(source, ToDb);
    private static List<GameAwardBadge> MapAwards(List<GameAwardBadgeDb> source) => MapList(source, ToEntity);
    private static List<ImportIssueDb> MapIssues(List<ImportIssue> source) => MapList(source, ToDb);
    private static List<ImportIssue> MapIssues(List<ImportIssueDb> source) => MapList(source, ToEntity);
    private static List<OrderItemSnapshotDb> MapItems(List<OrderItemSnapshot> source) => MapList(source, ToDb);
    private static List<OrderItemSnapshot> MapItems(List<OrderItemSnapshotDb> source) => MapList(source, ToEntity);
    private static List<OrderEventDb> MapEvents(List<OrderEvent> source) => MapList(source, ToDb);
    private static List<OrderEvent> MapEvents(List<OrderEventDb> source) => MapList(source, ToEntity);
    private static List<DeliveredKeyDb> MapKeys(List<DeliveredKey> source) => MapList(source, ToDb);
    private static List<DeliveredKey> MapKeys(List<DeliveredKeyDb> source) => MapList(source, ToEntity);
    private static List<BlogShownItemDb> MapShown(List<BlogShownItem> source) => MapList(source, ToDb);
    private static List<BlogShownItem> MapShown(List<BlogShownItemDb> source) => MapList(source, ToEntity);
    private static List<BlogReadingHistoryItemDb> MapHistory(List<BlogReadingHistoryItem> source) => MapList(source, ToDb);
    private static List<BlogReadingHistoryItem> MapHistory(List<BlogReadingHistoryItemDb> source) => MapList(source, ToEntity);
}
