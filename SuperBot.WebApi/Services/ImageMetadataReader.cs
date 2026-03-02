using SixLabors.ImageSharp;
using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Services;

public class ImageMetadataReader : IImageMetadataReader
{
    private readonly string _webRoot;

    public ImageMetadataReader(IWebHostEnvironment env)
    {
        _webRoot = string.IsNullOrWhiteSpace(env.WebRootPath)
            ? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot")
            : env.WebRootPath;
    }

    public Task<(int Width, int Height)?> TryReadImageSizeAsync(MediaAsset asset, CancellationToken ct = default)
    {
        if (asset == null || string.IsNullOrWhiteSpace(asset.Url))
        {
            return Task.FromResult<(int Width, int Height)?>(null);
        }

        var physicalPath = ResolvePhysicalPath(asset.Url);
        if (string.IsNullOrWhiteSpace(physicalPath))
        {
            return Task.FromResult<(int Width, int Height)?>(null);
        }

        return TryReadImageSizeAsync(physicalPath, ct);
    }

    public async Task<(int Width, int Height)?> TryReadImageSizeAsync(string physicalPath, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(physicalPath) || !File.Exists(physicalPath))
        {
            return null;
        }

        try
        {
            var info = await Image.IdentifyAsync(physicalPath, ct);
            if (info == null || info.Width <= 0 || info.Height <= 0)
            {
                return null;
            }

            return (info.Width, info.Height);
        }
        catch
        {
            return null;
        }
    }

    private string? ResolvePhysicalPath(string url)
    {
        string relativePath;

        if (Uri.TryCreate(url, UriKind.Absolute, out var absoluteUri))
        {
            relativePath = absoluteUri.AbsolutePath;
        }
        else if (Uri.TryCreate(url, UriKind.Relative, out var relativeUri))
        {
            relativePath = relativeUri.OriginalString;
        }
        else
        {
            return null;
        }

        relativePath = relativePath.TrimStart('/');
        var safePath = relativePath.Replace('/', Path.DirectorySeparatorChar);
        return Path.GetFullPath(Path.Combine(_webRoot, safePath));
    }
}
