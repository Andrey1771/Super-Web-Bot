using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.Infrastructure.ExternalServices
{
    /// <summary>
    /// Фоновая чистка устаревших steam-заказов. Раньше шла через MediatR-команду —
    /// теперь напрямую через репозиторий, чтобы сайт не тянул MediatR/бот-хендлеры.
    /// </summary>
    public class BackgroundTaskService(ISteamOrderRepository _steamOrderRepository) : IBackgroundTaskService
    {
        private const int RetentionDays = 30;

        public void ScheduleClearOutdatedDataJob()
        {
            // Fire-and-forget, как и раньше (Hangfire дергает синхронный метод).
            _ = ClearAsync();
        }

        private async Task ClearAsync()
        {
            var orders = await _steamOrderRepository.GetAllOrdersAsync();
            var oldOrderIds = orders
                .Where(order => (DateTime.UtcNow - order.OrderCreationDate).TotalDays > RetentionDays)
                .Select(order => order.Id)
                .ToList();

            foreach (var orderId in oldOrderIds)
            {
                await _steamOrderRepository.DeleteOrderAsync(orderId);
            }
        }
    }
}
