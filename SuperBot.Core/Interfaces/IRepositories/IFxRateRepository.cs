using SuperBot.Core.Payments;

namespace SuperBot.Core.Interfaces.IRepositories;

/// <summary>
/// Хранение курсов валют. Коллекция «только на добавление»: курсы не переписываются,
/// а накапливаются — иначе на вопрос «по какому курсу посчитали заказ в прошлый вторник»
/// ответить будет нечем.
/// </summary>
public interface IFxRateRepository
{
    /// <summary>Последний известный курс по каждой валюте для этой базовой.</summary>
    Task<IReadOnlyList<FxRate>> GetLatestAsync(string baseCurrency);

    /// <summary>Сохраняет принятые курсы новым снимком. Отклонённые гардом сюда не попадают.</summary>
    Task AddAsync(IEnumerable<FxRate> rates);

    /// <summary>История курса валюты, свежие первыми — для разбора спорных заказов.</summary>
    Task<IReadOnlyList<FxRate>> GetHistoryAsync(string baseCurrency, string currency, int limit);
}
