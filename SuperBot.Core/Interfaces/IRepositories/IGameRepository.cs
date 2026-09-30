using System.Collections.Generic;
using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IGameRepository
    {
        Task<List<Game>> GetAllAsync();
        Task<Game> GetByIdAsync(string id);
        Task<Game> GetByExternalIdAsync(string externalId);
        Task<Game> GetBySlugAsync(string slug);
        Task<List<Game>> GetByIdsAsync(IEnumerable<string> ids);

        /// <summary>
        /// Игры с собственной политикой активации или ценами за региональные варианты.
        ///
        /// Складской отчёт раньше грузил весь каталог, хотя нужен ему был только этот список:
        /// у остальных игр ключи «глобальные» и никакой региональной настройки нет. На каталоге
        /// в тридцать тысяч игр разница между «взять всё» и «взять единицы» решающая.
        /// </summary>
        Task<List<Game>> GetWithRegionSettingsAsync();
        Task<List<Game>> GetByCoverMediaIdAsync(string mediaId);

        /// <summary>
        /// Страница каталога для админских списков: поиск по названию, сортировка и окно строк
        /// считаются в базе, а не в браузере. Вместе со страницей возвращается общее число
        /// подходящих игр — без него список нечем прокручивать.
        ///
        /// onlyIds ограничивает выборку заранее известным набором (например, играми со скидкой),
        /// excludeIds — наоборот, исключает его. onlyWithManualPrices оставляет только игры,
        /// у которых выставлена хоть одна цена вручную, — этим фильтром живёт прайс-лист.
        /// </summary>
        Task<(List<Game> Items, long Total)> GetPageAsync(
            string? search,
            IReadOnlyCollection<string>? onlyIds,
            IReadOnlyCollection<string>? excludeIds,
            string sortBy,
            bool descending,
            int skip,
            int take,
            bool onlyWithManualPrices = false);
        Task CreateAsync(Game game);
        Task UpdateAsync(string id, Game updatedGame);
        Task DeleteAsync(string id);
    }
}
