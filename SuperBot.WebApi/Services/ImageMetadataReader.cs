using SixLabors.ImageSharp;
using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Services;

public class ImageMetadataReader : IImageMetadataReader
{
    private readonly string _webRoot;
    private static readonly HttpClient HttpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(10)
    };

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

        return TryReadFromAssetAsync(asset, ct);
    }

    private async Task<(int Width, int Height)?> TryReadFromAssetAsync(MediaAsset asset, CancellationToken ct)
    {
        var physicalPath = ResolvePhysicalPath(asset.Url);
        if (!string.IsNullOrWhiteSpace(physicalPath))
        {
            var fromFile = await TryReadImageSizeAsync(physicalPath, ct);
            if (fromFile.HasValue)
            {
                return fromFile;
            }
        }

        if (Uri.TryCreate(asset.Url, UriKind.Absolute, out var absoluteUri)
            && (absoluteUri.Scheme == Uri.UriSchemeHttp || absoluteUri.Scheme == Uri.UriSchemeHttps))
        {
            return await TryReadImageSizeFromRemoteAsync(absoluteUri, ct);
        }

        return null;
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

    private static async Task<(int Width, int Height)?> TryReadImageSizeFromRemoteAsync(Uri uri, CancellationToken ct)
    {
        try
        {
            await using var stream = await HttpClient.GetStreamAsync(uri, ct);
            var info = await Image.IdentifyAsync(stream, ct);
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
}
