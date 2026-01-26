using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using System.IO.Compression;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/admin/data-tools")]
[Authorize(Roles = "admin")]
public class AdminDataToolsController : ControllerBase
{
    private const int MaxZipSizeBytes = 50_000_000;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly IWebHostEnvironment _environment;
    private readonly IMediaAssetRepository _mediaRepository;
    private readonly IGameRepository _gameRepository;
    private readonly IBlogRepository _blogRepository;
    private readonly IImportJobRepository _importJobRepository;

    public AdminDataToolsController(
        IWebHostEnvironment environment,
        IMediaAssetRepository mediaRepository,
        IGameRepository gameRepository,
        IBlogRepository blogRepository,
        IImportJobRepository importJobRepository)
    {
        _environment = environment;
        _mediaRepository = mediaRepository;
        _gameRepository = gameRepository;
        _blogRepository = blogRepository;
        _importJobRepository = importJobRepository;
    }

    [HttpGet("template")]
    public IActionResult DownloadTemplate()
    {
        using var memoryStream = new MemoryStream();
        using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            AddZipEntry(archive, "package.json", JsonSerializer.Serialize(new DataToolsPackageMetadata
            {
                PackageVersion = 1,
                GeneratedAt = DateTime.UtcNow,
                Shop = "Tale Shop",
                Mode = "upsert",
                Includes = new DataToolsPackageIncludes
                {
                    Games = true,
                    Blog = true,
                    Media = true
                }
            }, JsonOptions));

            AddZipEntry(archive, "data/games.json", JsonSerializer.Serialize(new[]
            {
                new DataToolsGameRecord
                {
                    ExternalId = "game_001",
                    Slug = "witcher-3",
                    Title = "The Witcher 3",
                    Description = "Legendary RPG adventure.",
                    Price = 499,
                    Currency = "UAH",
                    GameType = "RolePlayingGames",
                    ReleaseDate = "2015-05-19",
                    Tags = new[] { "RPG", "Open World" },
                    Media = new DataToolsMediaLinks
                    {
                        Cover = "media/games/witcher-3/cover.jpg",
                        Gallery = new[] { "media/games/witcher-3/gallery_1.png" }
                    }
                }
            }, JsonOptions));

            AddZipEntry(archive, "data/blogPosts.json", JsonSerializer.Serialize(new[]
            {
                new DataToolsBlogRecord
                {
                    ExternalId = "post_001",
                    Slug = "winter-sale",
                    Title = "Winter Sale",
                    Excerpt = "Big discounts on winter games.",
                    ContentHtml = "<p>Winter sale is live!</p>",
                    PublishedAt = "2026-01-10T10:00:00Z",
                    Status = "published",
                    Media = new DataToolsMediaLinks
                    {
                        Cover = "media/blog/winter-sale/cover.jpg"
                    },
                    Versions = new List<DataToolsBlogVersion>
                    {
                        new()
                        {
                            Version = 1,
                            EditedAt = "2026-01-01T10:00:00Z",
                            ContentHtml = "<p>v1</p>"
                        },
                        new()
                        {
                            Version = 2,
                            EditedAt = "2026-01-05T10:00:00Z",
                            ContentHtml = "<p>v2</p>"
                        }
                    }
                }
            }, JsonOptions));

            AddZipEntry(archive, "media/README.txt", "Place images here. Example: media/games/<slug>/cover.jpg");
            AddZipEntry(archive, "VALIDATION.md", "All file paths must be relative and use forward slashes. Supported image types: jpg, png, webp.");
        }

        memoryStream.Position = 0;
        return File(memoryStream.ToArray(), "application/zip", "template.zip");
    }

    [HttpGet("imports")]
    public async Task<IActionResult> GetImports([FromQuery] int limit = 10)
    {
        var items = await _importJobRepository.GetRecentAsync(limit is < 1 or > 50 ? 10 : limit);
        return Ok(items);
    }

    [HttpGet("import/{id}")]
    public async Task<IActionResult> GetImportDetails(string id)
    {
        var job = await _importJobRepository.GetByIdAsync(id);
        if (job == null)
        {
            return NotFound();
        }

        return Ok(job);
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] bool includeMedia = true, [FromQuery] bool includeHistory = false)
    {
        var games = await _gameRepository.GetAllAsync();
        var posts = await _blogRepository.GetAllAsync();

        using var memoryStream = new MemoryStream();
        using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            var includes = new DataToolsPackageIncludes
            {
                Games = true,
                Blog = true,
                Media = includeMedia
            };

            AddZipEntry(archive, "package.json", JsonSerializer.Serialize(new DataToolsPackageMetadata
            {
                PackageVersion = 1,
                GeneratedAt = DateTime.UtcNow,
                Shop = "Tale Shop",
                Mode = "export",
                Includes = includes
            }, JsonOptions));

            var gameRecords = new List<DataToolsGameRecord>();
            foreach (var game in games)
            {
                var record = new DataToolsGameRecord
                {
                    ExternalId = game.ExternalId,
                    Slug = game.Slug,
                    Title = game.Title ?? game.Name,
                    Description = game.Description,
                    Price = game.Price,
                    Currency = "RUB",
                    GameType = game.GameType.ToString(),
                    ReleaseDate = game.ReleaseDate == default ? null : game.ReleaseDate.ToString("yyyy-MM-dd")
                };

                if (!string.IsNullOrWhiteSpace(game.CoverMediaId))
                {
                    record.Media = new DataToolsMediaLinks
                    {
                        Cover = await ResolveMediaExportPathAsync(archive, game.CoverMediaId, "games", game.Slug ?? Slugify(game.Title ?? game.Name), includeMedia)
                    };
                }

                gameRecords.Add(record);
            }

            AddZipEntry(archive, "data/games.json", JsonSerializer.Serialize(gameRecords, JsonOptions));

            var blogRecords = new List<DataToolsBlogRecord>();
            foreach (var post in posts)
            {
                var record = new DataToolsBlogRecord
                {
                    ExternalId = post.ExternalId,
                    Slug = post.Slug,
                    Title = post.Title,
                    Excerpt = post.Excerpt,
                    ContentHtml = string.Empty,
                    PublishedAt = post.PublishedAt?.ToString("O"),
                    Status = post.Status?.ToLowerInvariant(),
                    Media = string.IsNullOrWhiteSpace(post.CoverAssetId)
                        ? null
                        : new DataToolsMediaLinks
                        {
                            Cover = await ResolveMediaExportPathAsync(archive, post.CoverAssetId, "blog", post.Slug, includeMedia)
                        }
                };

                if (includeHistory)
                {
                    var versions = await _blogRepository.GetVersionsAsync(post.Id);
                    record.Versions = versions
                        .OrderBy(version => version.VersionNumber)
                        .Select(version => new DataToolsBlogVersion
                        {
                            Version = version.VersionNumber,
                            EditedAt = version.CreatedAt.ToString("O"),
                            ContentHtml = version.ContentHtml
                        })
                        .ToList();

                    var latest = versions.OrderByDescending(version => version.VersionNumber).FirstOrDefault();
                    if (latest != null)
                    {
                        record.ContentHtml = latest.ContentHtml;
                    }
                }
                else
                {
                    var latest = await _blogRepository.GetVersionByIdAsync(post.Id, post.CurrentVersionId);
                    record.ContentHtml = latest?.ContentHtml ?? string.Empty;
                }

                blogRecords.Add(record);
            }

            AddZipEntry(archive, "data/blogPosts.json", JsonSerializer.Serialize(blogRecords, JsonOptions));
        }

        memoryStream.Position = 0;
        return File(memoryStream.ToArray(), "application/zip", "export.zip");
    }

    [HttpPost("import")]
    [RequestSizeLimit(MaxZipSizeBytes)]
    public async Task<IActionResult> Import([FromForm] DataToolsImportForm form, CancellationToken ct)
    {
        if (form?.File == null || form.File.Length == 0)
        {
            return BadRequest("File is required.");
        }

        if (form.File.Length > MaxZipSizeBytes)
        {
            return BadRequest("File size exceeds limit.");
        }

        var parameters = ParseParameters(form.ParametersJson);
        var job = CreateImportJob(parameters);
        await _importJobRepository.CreateAsync(job);

        var errors = new List<ImportIssue>();
        var warnings = new List<ImportIssue>();
        var stats = new ImportJobStats();

        try
        {
            using var memoryStream = new MemoryStream();
            await form.File.CopyToAsync(memoryStream, ct);
            memoryStream.Position = 0;

            using var archive = new ZipArchive(memoryStream, ZipArchiveMode.Read, leaveOpen: true);
            var entryLookup = archive.Entries.ToDictionary(entry => entry.FullName.Replace("\\", "/"), entry => entry);

            var metadata = ReadPackageMetadata(entryLookup, errors);
            if (metadata == null)
            {
                return await FinishWithFailure(job, errors, warnings, stats, "failed");
            }

            var includes = metadata.Includes ?? new DataToolsPackageIncludes();
            job.Includes = new[]
            {
                includes.Games ? "games" : null,
                includes.Blog ? "blog" : null,
                includes.Media ? "media" : null
            }.Where(item => item != null).ToArray();

            var gameRecords = includes.Games ? ReadJsonFile<List<DataToolsGameRecord>>(entryLookup, "data/games.json", errors) : new();
            var blogRecords = includes.Blog ? ReadJsonFile<List<DataToolsBlogRecord>>(entryLookup, "data/blogPosts.json", errors) : new();

            ValidateRecords(gameRecords, blogRecords, errors);
            ValidateMediaReferences(entryLookup, gameRecords, blogRecords, errors, warnings);

            if (errors.Count > 0)
            {
                return await FinishWithFailure(job, errors, warnings, stats, "failed");
            }

            if (parameters.DryRun)
            {
                await SimulateImport(gameRecords, blogRecords, includes, parameters, stats, warnings);
                job.Status = "dry-run";
                job.Stats = stats;
                job.Errors = errors;
                job.Warnings = warnings;
                job.FinishedAt = DateTime.UtcNow;
                await _importJobRepository.UpdateAsync(job);
                return Ok(job);
            }

            await ApplyImport(entryLookup, gameRecords, blogRecords, includes, parameters, stats, warnings, ct);

            job.Status = "completed";
            job.Stats = stats;
            job.Errors = errors;
            job.Warnings = warnings;
            job.FinishedAt = DateTime.UtcNow;
            await _importJobRepository.UpdateAsync(job);
            return Ok(job);
        }
        catch (Exception ex)
        {
            errors.Add(new ImportIssue
            {
                Code = "exception",
                Message = ex.Message,
                Path = ""
            });
            return await FinishWithFailure(job, errors, warnings, stats, "failed");
        }
    }

    private async Task<IActionResult> FinishWithFailure(ImportJob job, List<ImportIssue> errors, List<ImportIssue> warnings, ImportJobStats stats, string status)
    {
        job.Status = status;
        job.Errors = errors;
        job.Warnings = warnings;
        job.Stats = stats;
        job.FinishedAt = DateTime.UtcNow;
        await _importJobRepository.UpdateAsync(job);
        return BadRequest(job);
    }

    private DataToolsImportParameters ParseParameters(string parametersJson)
    {
        if (string.IsNullOrWhiteSpace(parametersJson))
        {
            return new DataToolsImportParameters();
        }

        try
        {
            return JsonSerializer.Deserialize<DataToolsImportParameters>(parametersJson, JsonOptions) ?? new DataToolsImportParameters();
        }
        catch
        {
            return new DataToolsImportParameters();
        }
    }

    private ImportJob CreateImportJob(DataToolsImportParameters parameters)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "unknown";
        var userName = User.Identity?.Name ?? User.FindFirstValue("preferred_username") ?? "admin";
        return new ImportJob
        {
            UserId = userId,
            UserName = userName,
            StartedAt = DateTime.UtcNow,
            Status = "running",
            DryRun = parameters.DryRun
        };
    }

    private static DataToolsPackageMetadata ReadPackageMetadata(Dictionary<string, ZipArchiveEntry> entryLookup, List<ImportIssue> errors)
    {
        if (!entryLookup.TryGetValue("package.json", out var packageEntry))
        {
            errors.Add(new ImportIssue { Code = "missing-package", Message = "package.json is required.", Path = "package.json" });
            return null;
        }

        using var reader = new StreamReader(packageEntry.Open());
        var json = reader.ReadToEnd();
        var metadata = JsonSerializer.Deserialize<DataToolsPackageMetadata>(json, JsonOptions);
        if (metadata == null || metadata.PackageVersion != 1)
        {
            errors.Add(new ImportIssue { Code = "invalid-package", Message = "Unsupported packageVersion.", Path = "package.json" });
            return null;
        }

        return metadata;
    }

    private static T ReadJsonFile<T>(Dictionary<string, ZipArchiveEntry> entryLookup, string path, List<ImportIssue> errors) where T : new()
    {
        if (!entryLookup.TryGetValue(path, out var entry))
        {
            errors.Add(new ImportIssue { Code = "missing-file", Message = $"{path} is required.", Path = path });
            return new T();
        }

        using var reader = new StreamReader(entry.Open());
        var json = reader.ReadToEnd();
        try
        {
            return JsonSerializer.Deserialize<T>(json, JsonOptions) ?? new T();
        }
        catch (JsonException ex)
        {
            errors.Add(new ImportIssue { Code = "invalid-json", Message = ex.Message, Path = path });
            return new T();
        }
    }

    private static void ValidateMediaReferences(
        Dictionary<string, ZipArchiveEntry> entryLookup,
        IEnumerable<DataToolsGameRecord> games,
        IEnumerable<DataToolsBlogRecord> posts,
        List<ImportIssue> errors,
        List<ImportIssue> warnings)
    {
        var mediaPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var game in games)
        {
            if (game == null)
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(game.Media?.Cover))
            {
                mediaPaths.Add(game.Media.Cover);
            }
            if (game.Media?.Gallery != null)
            {
                foreach (var gallery in game.Media.Gallery)
                {
                    if (!string.IsNullOrWhiteSpace(gallery))
                    {
                        mediaPaths.Add(gallery);
                    }
                }
            }
        }

        foreach (var post in posts)
        {
            if (post == null)
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(post.Media?.Cover))
            {
                mediaPaths.Add(post.Media.Cover);
            }
        }

        foreach (var path in mediaPaths)
        {
            if (IsInvalidPath(path))
            {
                errors.Add(new ImportIssue { Code = "invalid-path", Message = "Media path must be relative and use forward slashes.", Path = path });
                continue;
            }

            if (!entryLookup.ContainsKey(path))
            {
                warnings.Add(new ImportIssue { Code = "missing-media", Message = "Media file not found in package.", Path = path });
            }
        }
    }

    private static void ValidateRecords(
        IEnumerable<DataToolsGameRecord> games,
        IEnumerable<DataToolsBlogRecord> posts,
        List<ImportIssue> errors)
    {
        var gameIndex = 0;
        foreach (var game in games)
        {
            if (game == null)
            {
                errors.Add(new ImportIssue
                {
                    Code = "invalid-game",
                    Message = "Game record is null.",
                    Path = $"games.json[{gameIndex}]"
                });
                gameIndex++;
                continue;
            }

            if (string.IsNullOrWhiteSpace(game.Title))
            {
                errors.Add(new ImportIssue
                {
                    Code = "missing-title",
                    Message = "Title is required.",
                    Path = $"games.json[{gameIndex}].title"
                });
            }

            if (string.IsNullOrWhiteSpace(game.ExternalId) && string.IsNullOrWhiteSpace(game.Slug))
            {
                errors.Add(new ImportIssue
                {
                    Code = "missing-key",
                    Message = "externalId or slug is required.",
                    Path = $"games.json[{gameIndex}].externalId"
                });
            }

            gameIndex++;
        }

        var postIndex = 0;
        foreach (var post in posts)
        {
            if (post == null)
            {
                errors.Add(new ImportIssue
                {
                    Code = "invalid-post",
                    Message = "Blog post record is null.",
                    Path = $"blogPosts.json[{postIndex}]"
                });
                postIndex++;
                continue;
            }

            if (string.IsNullOrWhiteSpace(post.Title))
            {
                errors.Add(new ImportIssue
                {
                    Code = "missing-title",
                    Message = "Title is required.",
                    Path = $"blogPosts.json[{postIndex}].title"
                });
            }

            if (string.IsNullOrWhiteSpace(post.ExternalId) && string.IsNullOrWhiteSpace(post.Slug))
            {
                errors.Add(new ImportIssue
                {
                    Code = "missing-key",
                    Message = "externalId or slug is required.",
                    Path = $"blogPosts.json[{postIndex}].externalId"
                });
            }

            postIndex++;
        }
    }

    private async Task SimulateImport(
        IEnumerable<DataToolsGameRecord> games,
        IEnumerable<DataToolsBlogRecord> posts,
        DataToolsPackageIncludes includes,
        DataToolsImportParameters parameters,
        ImportJobStats stats,
        List<ImportIssue> warnings)
    {
        if (includes.Games)
        {
            foreach (var game in games)
            {
                if (game == null)
                {
                    stats.GamesSkipped += 1;
                    continue;
                }

                var existing = await ResolveExistingGame(game);
                if (existing == null)
                {
                    if (AllowsCreate(parameters.Mode))
                    {
                        stats.GamesCreated += 1;
                    }
                    else
                    {
                        stats.GamesSkipped += 1;
                    }
                }
                else
                {
                    if (AllowsUpdate(parameters.Mode))
                    {
                        stats.GamesUpdated += 1;
                    }
                    else
                    {
                        stats.GamesSkipped += 1;
                    }
                }
            }
        }

        if (includes.Blog)
        {
            foreach (var post in posts)
            {
                if (post == null)
                {
                    stats.BlogSkipped += 1;
                    continue;
                }

                var existing = await ResolveExistingPost(post);
                if (existing == null)
                {
                    if (AllowsCreate(parameters.Mode))
                    {
                        stats.BlogCreated += 1;
                    }
                    else
                    {
                        stats.BlogSkipped += 1;
                    }
                }
                else
                {
                    if (AllowsUpdate(parameters.Mode))
                    {
                        stats.BlogUpdated += 1;
                    }
                    else
                    {
                        stats.BlogSkipped += 1;
                    }
                }
            }
        }

        if (includes.Media)
        {
            warnings.Add(new ImportIssue { Code = "media-simulated", Message = "Media import simulated; files were not uploaded.", Path = "media" });
        }
    }

    private async Task ApplyImport(
        Dictionary<string, ZipArchiveEntry> entryLookup,
        IEnumerable<DataToolsGameRecord> games,
        IEnumerable<DataToolsBlogRecord> posts,
        DataToolsPackageIncludes includes,
        DataToolsImportParameters parameters,
        ImportJobStats stats,
        List<ImportIssue> warnings,
        CancellationToken ct)
    {
        var mediaCache = new Dictionary<string, MediaAsset>(StringComparer.OrdinalIgnoreCase);
        var uploadFolder = Path.Combine(_environment.WebRootPath ?? "wwwroot", "uploads");
        if (!Directory.Exists(uploadFolder))
        {
            Directory.CreateDirectory(uploadFolder);
        }

        if (includes.Games)
        {
            foreach (var gameRecord in games)
            {
                if (gameRecord == null)
                {
                    stats.GamesSkipped += 1;
                    continue;
                }

                var existing = await ResolveExistingGame(gameRecord);
                if (existing == null && !AllowsCreate(parameters.Mode))
                {
                    stats.GamesSkipped += 1;
                    continue;
                }
                if (existing != null && !AllowsUpdate(parameters.Mode))
                {
                    stats.GamesSkipped += 1;
                    continue;
                }

                var coverAsset = await ResolveMediaAsset(entryLookup, gameRecord.Media?.Cover, mediaCache, includes.Media, parameters.MediaStrategy, stats, warnings, uploadFolder, ct);
                var game = existing ?? new Game
                {
                    ExternalId = gameRecord.ExternalId,
                    Slug = gameRecord.Slug,
                    Name = gameRecord.Title,
                    Title = gameRecord.Title
                };

                game.ExternalId = gameRecord.ExternalId ?? game.ExternalId;
                game.Slug = gameRecord.Slug ?? game.Slug;
                game.Name = gameRecord.Title ?? game.Name;
                game.Title = gameRecord.Title ?? game.Title;
                game.Description = gameRecord.Description ?? game.Description;
                if (gameRecord.Price.HasValue)
                {
                    game.Price = gameRecord.Price.Value;
                }
                game.GameType = ParseGameType(gameRecord.GameType, game.GameType);
                game.ReleaseDate = ParseDate(gameRecord.ReleaseDate) ?? game.ReleaseDate;
                if (coverAsset != null)
                {
                    game.CoverMediaId = coverAsset.Id;
                }

                if (existing == null)
                {
                    await _gameRepository.CreateAsync(game);
                    stats.GamesCreated += 1;
                }
                else
                {
                    await _gameRepository.UpdateAsync(existing.Id, game);
                    stats.GamesUpdated += 1;
                }
            }
        }

        if (includes.Blog)
        {
            foreach (var postRecord in posts)
            {
                if (postRecord == null)
                {
                    stats.BlogSkipped += 1;
                    continue;
                }

                var existing = await ResolveExistingPost(postRecord);
                if (existing == null && !AllowsCreate(parameters.Mode))
                {
                    stats.BlogSkipped += 1;
                    continue;
                }
                if (existing != null && !AllowsUpdate(parameters.Mode))
                {
                    stats.BlogSkipped += 1;
                    continue;
                }

                var coverAsset = await ResolveMediaAsset(entryLookup, postRecord.Media?.Cover, mediaCache, includes.Media, parameters.MediaStrategy, stats, warnings, uploadFolder, ct);
                var now = DateTime.UtcNow;
                var post = existing ?? new BlogPost
                {
                    CreatedAt = now,
                    UpdatedAt = now,
                    ViewCount = 0,
                    AuthorName = "Import"
                };

                post.ExternalId = postRecord.ExternalId ?? post.ExternalId;
                post.Slug = postRecord.Slug ?? post.Slug ?? Slugify(postRecord.Title ?? postRecord.ExternalId);
                post.Title = postRecord.Title ?? post.Title;
                post.Excerpt = postRecord.Excerpt ?? post.Excerpt;
                post.Status = NormalizeStatus(postRecord.Status) ?? post.Status;
                post.PublishedAt = ParseDateTime(postRecord.PublishedAt) ?? post.PublishedAt;
                post.UpdatedAt = now;
                post.AuthorName = post.AuthorName ?? "Import";
                if (coverAsset != null)
                {
                    post.CoverAssetId = coverAsset.Id;
                    post.CoverUrl = coverAsset.Url;
                }

                var nextVersion = 1;
                if (existing != null)
                {
                    var versions = await _blogRepository.GetVersionsAsync(existing.Id);
                    nextVersion = versions.Count == 0 ? 1 : versions.Max(item => item.VersionNumber) + 1;
                }

                var version = BuildVersion(post, postRecord, parameters.IncludeHistory, nextVersion);
                if (existing == null)
                {
                    await _blogRepository.CreateAsync(post, version);
                    stats.BlogCreated += 1;
                }
                else
                {
                    await _blogRepository.UpdateAsync(post, version);
                    stats.BlogUpdated += 1;
                }

                if (parameters.IncludeHistory && postRecord.Versions != null)
                {
                    foreach (var history in postRecord.Versions.OrderBy(item => item.Version))
                    {
                        if (history.Version == version.VersionNumber)
                        {
                            continue;
                        }

                        await _blogRepository.AddVersionAsync(new BlogPostVersion
                        {
                            PostId = post.Id,
                            VersionNumber = history.Version,
                            Title = post.Title,
                            Excerpt = post.Excerpt,
                            ContentHtml = history.ContentHtml ?? string.Empty,
                            CreatedAt = ParseDateTime(history.EditedAt) ?? now,
                            CreatedBy = post.AuthorName,
                            ChangeNote = "Imported version"
                        });
                    }
                }
            }
        }
    }

    private async Task<MediaAsset> ResolveMediaAsset(
        Dictionary<string, ZipArchiveEntry> entryLookup,
        string path,
        Dictionary<string, MediaAsset> cache,
        bool includeMedia,
        string mediaStrategy,
        ImportJobStats stats,
        List<ImportIssue> warnings,
        string uploadFolder,
        CancellationToken ct)
    {
        if (!includeMedia || string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        if (cache.TryGetValue(path, out var cachedAsset))
        {
            return cachedAsset;
        }

        if (!entryLookup.TryGetValue(path, out var entry))
        {
            warnings.Add(new ImportIssue { Code = "missing-media", Message = "Media file missing.", Path = path });
            return null;
        }

        var extension = Path.GetExtension(path).ToLowerInvariant();
        var allowed = new HashSet<string> { ".jpg", ".jpeg", ".png", ".webp" };
        if (!allowed.Contains(extension))
        {
            warnings.Add(new ImportIssue { Code = "unsupported-media", Message = "Unsupported media extension.", Path = path });
            return null;
        }

        using var entryStream = entry.Open();
        using var memoryStream = new MemoryStream();
        await entryStream.CopyToAsync(memoryStream, ct);
        var buffer = memoryStream.ToArray();
        var hash = ComputeHash(buffer);
        var existing = await _mediaRepository.GetByHashAsync(hash, buffer.LongLength);

        if (existing != null && (string.IsNullOrWhiteSpace(mediaStrategy) ||
            string.Equals(mediaStrategy, "missing-only", StringComparison.OrdinalIgnoreCase)))
        {
            stats.MediaSkipped += 1;
            cache[path] = existing;
            return existing;
        }

        var filename = Path.GetFileName(path);
        var uniqueFileName = $"{Guid.NewGuid():N}{extension}";
        var physicalPath = Path.Combine(uploadFolder, uniqueFileName);
        await System.IO.File.WriteAllBytesAsync(physicalPath, buffer, ct);

        var relativeUrl = $"/uploads/{uniqueFileName}";
        var absoluteUrl = $"{Request.Scheme}://{Request.Host}{relativeUrl}";
        var asset = new MediaAsset
        {
            Url = absoluteUrl,
            Filename = filename,
            ContentType = ResolveContentType(extension),
            SizeBytes = buffer.LongLength,
            HashSha256 = hash,
            CreatedAt = DateTime.UtcNow,
            Tags = Array.Empty<string>()
        };

        await _mediaRepository.CreateAsync(asset);
        stats.MediaCreated += 1;
        cache[path] = asset;
        return asset;
    }

    private static string ResolveContentType(string extension)
    {
        return extension switch
        {
            ".jpg" => "image/jpeg",
            ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "application/octet-stream"
        };
    }

    private static string ComputeHash(byte[] data)
    {
        using var sha256 = SHA256.Create();
        var hash = sha256.ComputeHash(data);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private async Task<Game> ResolveExistingGame(DataToolsGameRecord record)
    {
        if (!string.IsNullOrWhiteSpace(record.ExternalId))
        {
            return await _gameRepository.GetByExternalIdAsync(record.ExternalId);
        }

        if (!string.IsNullOrWhiteSpace(record.Slug))
        {
            return await _gameRepository.GetBySlugAsync(record.Slug);
        }

        return null;
    }

    private async Task<BlogPost> ResolveExistingPost(DataToolsBlogRecord record)
    {
        if (!string.IsNullOrWhiteSpace(record.ExternalId))
        {
            return await _blogRepository.GetByExternalIdAsync(record.ExternalId);
        }

        if (!string.IsNullOrWhiteSpace(record.Slug))
        {
            return await _blogRepository.GetBySlugAsync(record.Slug);
        }

        return null;
    }

    private static bool AllowsCreate(string mode)
    {
        return string.IsNullOrWhiteSpace(mode) || mode.Equals("upsert", StringComparison.OrdinalIgnoreCase) ||
               mode.Equals("create+update", StringComparison.OrdinalIgnoreCase) ||
               mode.Equals("create-only", StringComparison.OrdinalIgnoreCase);
    }

    private static bool AllowsUpdate(string mode)
    {
        return string.IsNullOrWhiteSpace(mode) || mode.Equals("upsert", StringComparison.OrdinalIgnoreCase) ||
               mode.Equals("create+update", StringComparison.OrdinalIgnoreCase) ||
               mode.Equals("update-existing", StringComparison.OrdinalIgnoreCase);
    }

    private static DateTime? ParseDate(string value)
    {
        if (DateTime.TryParse(value, out var date))
        {
            return date;
        }

        return null;
    }

    private static DateTime? ParseDateTime(string value)
    {
        if (DateTime.TryParse(value, out var date))
        {
            return date;
        }

        return null;
    }

    private static GameType ParseGameType(string gameType, GameType fallback)
    {
        if (string.IsNullOrWhiteSpace(gameType))
        {
            return fallback;
        }

        if (gameType.Equals("RPG", StringComparison.OrdinalIgnoreCase))
        {
            return GameType.RolePlayingGames;
        }

        if (Enum.TryParse<GameType>(gameType, true, out var parsed))
        {
            return parsed;
        }

        return fallback;
    }

    private static string NormalizeStatus(string status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return null;
        }

        return status.Trim().ToUpperInvariant();
    }

    private static bool IsInvalidPath(string path)
    {
        return Path.IsPathRooted(path) || path.Contains("..");
    }

    private static void AddZipEntry(ZipArchive archive, string path, string content)
    {
        var entry = archive.CreateEntry(path);
        using var writer = new StreamWriter(entry.Open(), Encoding.UTF8);
        writer.Write(content);
    }

    private async Task<string> ResolveMediaExportPathAsync(ZipArchive archive, string assetId, string category, string slug, bool includeMedia)
    {
        if (!includeMedia)
        {
            return null;
        }

        var asset = await _mediaRepository.GetByIdAsync(assetId);
        if (asset == null || string.IsNullOrWhiteSpace(asset.Url))
        {
            return null;
        }

        var fileName = Path.GetFileName(new Uri(asset.Url).AbsolutePath);
        var sourcePath = Path.Combine(_environment.WebRootPath ?? "wwwroot", "uploads", fileName);
        if (!System.IO.File.Exists(sourcePath))
        {
            return null;
        }

        var extension = Path.GetExtension(fileName);
        var safeSlug = string.IsNullOrWhiteSpace(slug) ? "item" : slug;
        var outputPath = $"media/{category}/{safeSlug}/{Guid.NewGuid():N}{extension}";
        var entry = archive.CreateEntry(outputPath);
        await using var source = System.IO.File.OpenRead(sourcePath);
        await using var target = entry.Open();
        await source.CopyToAsync(target);
        return outputPath;
    }

    private static string Slugify(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "item";
        }

        var slug = new string(value.ToLowerInvariant()
            .Where(ch => char.IsLetterOrDigit(ch) || char.IsWhiteSpace(ch) || ch == '-')
            .Select(ch => char.IsWhiteSpace(ch) ? '-' : ch)
            .ToArray());

        return slug.Trim('-');
    }

    private static BlogPostVersion BuildVersion(BlogPost post, DataToolsBlogRecord record, bool includeHistory, int fallbackVersion)
    {
        var versions = record.Versions ?? new List<DataToolsBlogVersion>();
        var selected = includeHistory && versions.Count > 0
            ? versions.OrderByDescending(item => item.Version).First()
            : null;

        var versionNumber = selected?.Version ?? fallbackVersion;
        var content = selected?.ContentHtml ?? record.ContentHtml ?? string.Empty;
        var editedAt = ParseDateTime(selected?.EditedAt) ?? DateTime.UtcNow;

        return new BlogPostVersion
        {
            PostId = post.Id,
            VersionNumber = versionNumber,
            Title = post.Title,
            Excerpt = post.Excerpt,
            ContentHtml = content,
            CreatedAt = editedAt,
            CreatedBy = post.AuthorName,
            ChangeNote = "Imported"
        };
    }
}

public class DataToolsImportForm
{
    [FromForm(Name = "file")]
    public IFormFile File { get; set; }

    [FromForm(Name = "params")]
    public string ParametersJson { get; set; }
}

public class DataToolsImportParameters
{
    public bool DryRun { get; set; }
    public string Mode { get; set; } = "upsert";
    public bool IncludeHistory { get; set; }
    public string MediaStrategy { get; set; } = "missing-only";
}

public class DataToolsPackageMetadata
{
    public int PackageVersion { get; set; }
    public DateTime? GeneratedAt { get; set; }
    public string Shop { get; set; }
    public string Mode { get; set; }
    public DataToolsPackageIncludes Includes { get; set; }
}

public class DataToolsPackageIncludes
{
    public bool Games { get; set; }
    public bool Blog { get; set; }
    public bool Media { get; set; }
}

public class DataToolsGameRecord
{
    public string ExternalId { get; set; }
    public string Slug { get; set; }
    public string Title { get; set; }
    public string Description { get; set; }
    public decimal? Price { get; set; }
    public string Currency { get; set; }
    public string GameType { get; set; }
    public string ReleaseDate { get; set; }
    public string[] Tags { get; set; }
    public DataToolsMediaLinks Media { get; set; }
}

public class DataToolsBlogRecord
{
    public string ExternalId { get; set; }
    public string Slug { get; set; }
    public string Title { get; set; }
    public string Excerpt { get; set; }
    public string ContentHtml { get; set; }
    public string PublishedAt { get; set; }
    public string Status { get; set; }
    public DataToolsMediaLinks Media { get; set; }
    public List<DataToolsBlogVersion> Versions { get; set; }
}

public class DataToolsMediaLinks
{
    public string Cover { get; set; }
    public string[] Gallery { get; set; }
}

public class DataToolsBlogVersion
{
    public int Version { get; set; }
    public string EditedAt { get; set; }
    public string ContentHtml { get; set; }
}
