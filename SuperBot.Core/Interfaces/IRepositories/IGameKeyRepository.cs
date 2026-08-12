using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    /// <summary>
    /// Итог заливки пула. Added — добавлено; SkippedDuplicates — пропущено как дубли активных;
    /// PreviouslyVoided — добавлено, НО такое значение раньше уже изымалось (историческое предупреждение).
    /// </summary>
    public sealed record AddPoolKeysResult(int Added, int SkippedDuplicates, int PreviouslyVoided);

    /// <summary>Итог правки ключа: Ok — применено; DuplicateActive — такое значение уже есть активным; NotEditable — ключ выдан/изъят/не найден.</summary>
    public enum EditKeyOutcome { Ok, DuplicateActive, NotEditable }

    /// <summary>
    /// Строка списка ключей для админки. У ВЫДАННЫХ <see cref="Key"/> замаскирован (last-4) — выданный,
    /// но не активированный ключ ещё «живой»; у пуловых показывается полностью (админу нужно сверять).
    /// </summary>
    public sealed record GameKeyListItem(
        string Id, string Key, bool Masked, string KeyType, string Status, string? OwnerEmail, DateTime? IssuedAt);

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
        Task<AddPoolKeysResult> AddPoolKeysAsync(string gameId, string keyType, IEnumerable<string> keys);

        /// <summary>
        /// Список/поиск ключей игры с пагинацией. query — подстрока ключа ИЛИ email покупателя (регистронезависимо);
        /// status — "pool" | "delivered" | "voided" | иное/пусто = все. Пуловые вперёд, затем выданные/изъятые по дате убыв.
        /// </summary>
        Task<GameKeyPage> GetKeysPagedAsync(string gameId, string? query, string? status, int page, int pageSize);

        /// <summary>Сводка запасов по ВСЕМ играм (одним агрегатом): остаток/выдано/изъято на игру.</summary>
        Task<IReadOnlyList<GameKeyInventoryStat>> GetInventorySummaryAsync();

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
        Task<int> CountAvailableByGameAsync(string gameId);
        Task<int> CountAssignedByGameAsync(string gameId);
        // Атомарно берёт один свободный ключ из пула игры и закрепляет за пользователем (null — пул пуст).
        Task<GameKey> TryDispensePoolKeyAsync(string gameId, string userId);
    }
}
