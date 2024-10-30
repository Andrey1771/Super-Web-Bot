using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces
{
    public interface IResourceService
    {
        Resources Resources { get; }

        Task UpdateResourcesAsync(Resources newResources);
    }
}
