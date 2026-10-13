using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces
{
    /// <summary>
    /// Кому нужно знать, что заказ полностью выдан. Выдача ключей зовёт всех зарегистрированных
    /// наблюдателей после сохранения заказа; нет ни одного (как в бот-сервисе) — не зовёт никого.
    /// Ошибка наблюдателя выдачу не отменяет.
    /// </summary>
    public interface IOrderFulfillmentObserver
    {
        Task OnOrderDeliveredAsync(Order order);
    }
}
