using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Services;

public interface IImageMetadataReader
{
    Task<(int Width, int Height)?> TryReadImageSizeAsync(MediaAsset asset, CancellationToken ct = default);
    Task<(int Width, int Height)?> TryReadImageSizeAsync(string physicalPath, CancellationToken ct = default);
}
