namespace SuperBot.Core.Interfaces
{
    public interface IWishlistDiscountAlertService
    {
        /// <summary>
        /// Шлёт Telegram-алерты всем, у кого игра в wishlist и привязан чат.
        /// Скидку перечитывает по gameId; шлёт только если она активна прямо сейчас. Best-effort.
        /// </summary>
        Task NotifyGameDiscountAsync(string gameId);
    }
}
