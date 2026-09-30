using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories;

public interface IGameDiscountRepository
{
    Task<GameDiscount?> GetByGameIdAsync(string gameId);
    Task<List<GameDiscount>> GetByGameIdsAsync(IEnumerable<string> gameIds);

    /// <summary>
    /// Все скидки. В коллекции по документу на игру СО скидкой, а не на каждую игру каталога,
    /// поэтому она мала и её можно читать целиком: из неё строится статус для страницы скидок.
    /// </summary>
    Task<List<GameDiscount>> GetAllAsync();
    /// <summary>
    /// Окно строк админского списка скидок: игры вместе со скидками, отфильтрованные по статусу
    /// и отсортированные по любой колонке — включая итоговую цену и статус, которых нет ни в
    /// одной из коллекций по отдельности. Всё считает база: сортировать загруженное окно в
    /// браузере значило бы упорядочивать пятьдесят строк и выдавать это за порядок каталога.
    ///
    /// sortBy: title | basePrice | discountPercent | finalPrice | period | status.
    /// now — момент, на который считается статус скидки.
    /// </summary>
    Task<(List<GameDiscountRow> Items, long Total)> GetCatalogPageAsync(
        string? search,
        string status,
        string sortBy,
        bool descending,
        int skip,
        int take,
        DateTime now);

    Task UpsertAsync(GameDiscount discount);
    Task DeleteByGameIdAsync(string gameId);
}
