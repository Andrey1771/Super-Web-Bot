using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    /// <summary>
    /// Итог заливки пула. Added — добавлено; SkippedDuplicates — пропущено как дубли активных;
    /// PreviouslyVoided — добавлено, НО такое значение раньше уже изымалось (историческое предупреждение).
    /// </summary>
    public sealed record AddPoolKeysResult(int Added, int SkippedDuplicates, int PreviouslyVoided);

    /// <summary>
    /// Себестоимость партии ключей: одна на всю заливку.
    ///
    /// Записывается на КАЖДЫЙ ключ, а не в отдельную таблицу партий. Причина — история: закупочные
    /// цены меняются, а отчёт за прошлый месяц не должен меняться вместе с ними. Цена, с которой
    /// ключ пришёл, остаётся при нём навсегда, даже если ту же игру потом закупили дороже.
    ///
    /// BatchId один на заливку — по нему партию видно целиком и можно исправить, если ошиблись
    /// в цене при вводе.
    /// </summary>
    public sealed record KeyBatchCost(decimal UnitCost, string Currency, string? Supplier, string BatchId);

    /// <summary>
    /// Группа ключей без закупочной цены — кандидат на проставление задним числом.
    ///
    /// У ключей, залитых до появления учёта, нет ни BatchId, ни даты закупки. Единственный
    /// след того, что они пришли одной партией, — время создания записи, зашитое в ObjectId.
    /// По нему и группируем: «40 ключей Stardew Valley, залиты 28 июля» — это ровно то, чем
    /// партия была на самом деле, и по этому описанию человек узнаёт свою закупку.
    /// </summary>
    public sealed record KeyCostGroup(
        string GameId,
        string? BatchId,
        DateTime UploadedOn,
        string KeyType,
        string? EditionCode,
        int Keys,
        int InPool,
        int Delivered,
        int Voided);

    /// <summary>
    /// Куда проставить цену. Пустые поля означают «любой»: так можно накрыть и одну партию,
    /// и все ключи игры сразу.
    ///
    /// Limit — сколько ключей взять из группы (по порядку заведения). Он и решает случай
    /// «часть куплена по одной цене, часть по другой»: применяем дважды с разными ценами.
    /// </summary>
    public sealed record KeyCostBackfillTarget(
        string GameId,
        string? BatchId = null,
        DateTime? UploadedOn = null,
        string? KeyType = null,
        string? EditionCode = null,
        int? Limit = null);

    /// <summary>Итог проставления: сколько ключей затронуто (при DryRun — сколько было бы).</summary>
    public sealed record KeyCostBackfillResult(int Matched, int Updated, bool DryRun);

    /// <summary>Итог правки ключа: Ok — применено; DuplicateActive — такое значение уже есть активным; NotEditable — ключ выдан/изъят/не найден.</summary>
    public enum EditKeyOutcome { Ok, DuplicateActive, NotEditable }

    /// <summary>
    /// Строка списка ключей для админки. У ВЫДАННЫХ <see cref="Key"/> замаскирован (last-4) — выданный,
    /// но не активированный ключ ещё «живой»; у пуловых показывается полностью (админу нужно сверять).
    /// </summary>
    public sealed record GameKeyListItem(
        string Id, string Key, bool Masked, string KeyType, string Status, string? OwnerEmail, DateTime? IssuedAt,
        string? AddedBy = null, string? IssuedBy = null, string? EditionCode = null, string? RegionSummary = null,
        // Себестоимость видна в списке: иначе её можно было бы завести, но нельзя проверить —
        // ошибка в цене всплыла бы только в отчёте, когда исправлять поздно.
        decimal? UnitCost = null, string? CostCurrency = null, string? Supplier = null, string? BatchId = null);

    /// <summary>Сколько ключей лежит в пуле под данной политикой (Summary — короткая подпись, Policy null — политика игры).</summary>
    public sealed record RegionPoolStat(string Summary, SuperBot.Core.Regions.RegionPolicy? Policy, int Available, string? EditionCode);

    /// <summary>
    /// Что известно про доступные ключи игры: где они активируются, на какой площадке и сколько их.
    ///
    /// <paramref name="KeyPolicies"/> — политики партий (null внутри списка означает «как у игры»).
    /// Витрина обязана считать регион по ним, а не по политике игры: выдача берёт ключ, глядя
    /// именно на политику партии, и магазин, ограничивший одну партию, ждёт того же на витрине.
    /// </summary>
    /// <summary>Выдачи за один день по одной партии: игра, политика, дата (UTC, без времени), количество.</summary>
    public sealed record KeyUsageStat(string GameId, SuperBot.Core.Regions.RegionPolicy? Policy, DateTime Day, int Count);

    /// <summary>
    /// Итог по одной группе партий: сколько свободно, сколько выдано и у скольких игр они есть.
    /// <see cref="GameId"/> заполнен только там, где область зависит от политики самой игры.
    /// </summary>
    public sealed record RegionTotalsStat(
        SuperBot.Core.Regions.RegionPolicy? Policy,
        string? GameId,
        int Available,
        int Delivered,
        int GamesInStock);

    /// <summary>Строка склада: игра, политика партии, сколько свободно и сколько уже выдано.</summary>
    public sealed record GameRegionStockStat(
        string GameId,
        SuperBot.Core.Regions.RegionPolicy? Policy,
        int Available,
        int Delivered);

    public sealed record KeyActivationInfo(
        IReadOnlyList<string> Platforms,
        int Available,
        IReadOnlyList<SuperBot.Core.Regions.RegionPolicy?> KeyPolicies);

    /// <summary>Страница списка ключей: элементы + общий счётчик по фильтру (для пагинации).</summary>
    public sealed record GameKeyPage(IReadOnlyList<GameKeyListItem> Items, long Total);

    /// <summary>Сводка по ключам одной игры: остаток в пуле, выдано, изъято. Для обзора запасов по всем играм.</summary>
    public sealed record GameKeyInventoryStat(string GameId, int Available, int Delivered, int Voided);

    /// <summary>
    /// Какими типами ключей игра вообще продаётся. Считаются и выданные ключи: то, что запас
    /// временно кончился, не отменяет факта, что игра продаётся, например, для Xbox.
    /// </summary>
    public sealed record GameKeyTypeStat(string GameId, string KeyType, int Total);

    public interface IGameKeyRepository
    {
        Task<List<GameKey>> GetByUserAsync(string userId, int limit);
        Task AddAsync(GameKey gameKey);

        // Инвентарь (B): пул-ключ — это GameKey с пустым UserId (ещё не выдан).
        // Дубли (по хешу, в рамках игры) не добавляются повторно — см. AddPoolKeysResult.
        Task<AddPoolKeysResult> AddPoolKeysAsync(string gameId, string keyType, IEnumerable<string> keys, string? addedBy = null, string? editionCode = null, SuperBot.Core.Regions.RegionPolicy? regionPolicy = null, KeyBatchCost? cost = null);

        /// <summary>Ключи без закупочной цены, сгруппированные по игре, партии и дню заливки.</summary>
        Task<IReadOnlyList<KeyCostGroup>> ListKeysWithoutCostAsync();

        /// <summary>
        /// Проставить закупочную цену ключам без неё. Уже заполненные НЕ трогает: задача —
        /// восстановить недостающее, а не переписать историю задним числом.
        /// </summary>
        Task<KeyCostBackfillResult> BackfillCostAsync(KeyCostBackfillTarget target, KeyBatchCost cost, bool dryRun);

        /// <summary>Тот же расчёт, что у AddPoolKeysAsync, но без вставки: сколько добавится, сколько дублей, сколько изъятых раньше.</summary>
        Task<AddPoolKeysResult> PreviewPoolKeysAsync(string gameId, IEnumerable<string> keys);

        /// <summary>
        /// Список/поиск ключей игры с пагинацией. query — подстрока ключа ИЛИ email покупателя (регистронезависимо);
        /// status — "pool" | "delivered" | "voided" | иное/пусто = все. Пуловые вперёд, затем выданные/изъятые по дате убыв.
        /// </summary>
        Task<GameKeyPage> GetKeysPagedAsync(string gameId, string? query, string? status, int page, int pageSize);

        /// <summary>Сводка запасов по ВСЕМ играм (одним агрегатом): остаток/выдано/изъято на игру.</summary>
        Task<IReadOnlyList<GameKeyInventoryStat>> GetInventorySummaryAsync();

        /// <summary>
        /// Остаток и выдачи в разрезе «игра × область активации».
        ///
        /// Нужен складу: партия «EU» может кончиться, пока «Global» ещё есть, и по общей цифре
        /// остатка этого не видно. Выданные ключи считаем тоже — по ним понятно, что регион
        /// продавался и его стоит пополнить, а не что его никогда не было.
        /// </summary>
        /// <summary>
        /// Строки склада «игра × партия», отсортированные базой: сначала пустые, затем самые
        /// продаваемые. <paramref name="limit"/> ограничивает выдачу — отчёту нужна верхушка
        /// (что пополнять), а не строка на каждую из тридцати тысяч игр.
        /// </summary>
        Task<IReadOnlyList<GameRegionStockStat>> GetRegionStockAsync(int limit);

        /// <summary>
        /// Итоги по партиям: суммы и число игр с ключами — посчитанные в базе.
        ///
        /// Партия без своей политики живёт по политике игры, поэтому такие строки нужны отдельно
        /// по каждой игре из <paramref name="gamesWithOwnPolicy"/>; все остальные сворачиваются
        /// в одну строку — у них область одна и та же. Так итоги не зависят от размера каталога.
        /// </summary>
        Task<IReadOnlyList<RegionTotalsStat>> GetRegionTotalsAsync(IReadOnlyCollection<string> gamesWithOwnPolicy);

        /// <summary>
        /// Строки склада по конкретным играм. Дополняет <see cref="GetRegionStockAsync"/>: там верхушка
        /// самых пустых, а прогноз нужен и для игр, которые быстро продаются при большом остатке —
        /// в верхушку по пустоте они не попадают. Число таких игр ограничено продажами, а не каталогом.
        /// </summary>
        Task<IReadOnlyList<GameRegionStockStat>> GetRegionStockForGamesAsync(IReadOnlyCollection<string> gameIds);

        /// <summary>
        /// Расход ключей по дням начиная с <paramref name="fromUtc"/>: что уходит и из какой области.
        ///
        /// Остаток отвечает «сколько лежит», расход — «насколько этого хватит». Без него нельзя
        /// отличить область, где два ключа лежат год, от области, где два ключа — это на день.
        /// </summary>
        Task<IReadOnlyList<KeyUsageStat>> GetKeyUsageAsync(DateTime fromUtc);

        /// <summary>
        /// Типы ключей по ВСЕМ играм (одним агрегатом) — из них витрина выводит платформы
        /// на карточке и фильтр по платформам. Изъятые ключи не учитываются.
        /// </summary>
        Task<IReadOnlyList<GameKeyTypeStat>> GetKeyTypeSummaryAsync();

        /// <summary>Мягко изымает ПУЛОВЫЙ ключ: Voided=true, plaintext стирается, KeyHash остаётся. false — не найден/не пуловый.</summary>
        Task<bool> VoidPoolKeyAsync(string gameId, string keyId);

        /// <summary>Жёстко удаляет ключ (пуловый или изъятый) — освобождает значение под повторную заливку. Выданные не трогает. false — не найден/выдан.</summary>
        Task<bool> PurgeKeyAsync(string gameId, string keyId);

        /// <summary>Правит ПУЛОВЫЙ ключ (значение и/или тип). При смене значения пересчитывает хеш и проверяет уникальность среди активных.</summary>
        Task<EditKeyOutcome> EditPoolKeyAsync(string gameId, string keyId, string? newKey, string? newKeyType);
        Task<int> CountAvailableByGameAsync(string gameId, string? editionCode = null);
        /// <summary>Остаток в пуле по каждому изданию игры: ключ базового издания — под пустым кодом.</summary>
        Task<IReadOnlyDictionary<string, int>> CountAvailableByEditionAsync(string gameId);
        /// <summary>
        /// То же для многих игр одним запросом: игра → издание → остаток (базовое — под пустым кодом). Нужно снимку
        /// каталога: у ПО каждая лицензия — издание со своим складом, и перебирать товары по одному нельзя.
        /// </summary>
        Task<IReadOnlyDictionary<string, IReadOnlyDictionary<string, int>>> CountAvailableByEditionForGamesAsync(IReadOnlyCollection<string> gameIds);
        Task<int> CountAssignedByGameAsync(string gameId);
        // Атомарно берёт один свободный ключ из пула игры и закрепляет за пользователем (null — пул пуст).
        /// <summary>Выдаёт ключ нужного издания; пустой код — ключ базового издания (без кода). Ключи другого издания не подходят.</summary>
        /// <param name="orderId">
        /// Заказ, по которому уходит ключ. Нужен, чтобы себестоимость привязывалась к конкретной
        /// продаже: без него нельзя ни посчитать маржу по каналу привлечения, ни ответить в
        /// поддержке, какой ключ ушёл по какому заказу.
        /// </param>
        Task<GameKey> TryDispensePoolKeyAsync(string gameId, string userId, string? issuedBy = null, string? editionCode = null, string? buyerCountry = null, string? orderId = null, string? offerKey = null);
        /// <summary>Остаток в пуле по политикам активации (ключ без своей политики — под пустым ключом словаря = политика игры).</summary>
        Task<IReadOnlyList<RegionPoolStat>> CountAvailableByRegionPolicyAsync(string gameId);

        /// <summary>
        /// Где активируются доступные ключи каждой игры и сколько их.
        ///
        /// Площадка активации — свойство самой партии (Steam, Epic Games…), а не игры: один и тот
        /// же тайтл магазин может продавать ключами разных сторов. Поэтому источник здесь — склад,
        /// а не карточка игры: витрина обязана называть ту площадку, ключ для которой покупатель
        /// реально получит.
        /// </summary>
        Task<IReadOnlyDictionary<string, KeyActivationInfo>> GetActivationInfoAsync(IReadOnlyCollection<string> gameIds);
    }
}
