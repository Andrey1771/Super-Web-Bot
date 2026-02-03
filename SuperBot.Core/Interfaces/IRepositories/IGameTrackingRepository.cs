using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IGameTrackingRepository
    {
        Task AddEventAsync(GameTrackingEvent trackingEvent);
    }
}
