using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services.SteamImport;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Импорт каталога из Steam: список appid (или адресов страниц Steam) → фоновая задача, которая
/// заводит игры с описаниями, переводами, скриншотами, трейлерами и требованиями. Ход задачи — в
/// журнале импорта (ImportJobs), его же читает страница импорта в админке.
/// </summary>
[ApiController]
[Route("api/admin/steam-import")]
[Authorize(Roles = "admin")]
public partial class AdminSteamImportController(
    IImportJobRepository jobs,
    ISteamImportQueue queue) : ControllerBase
{
    public const int MaxAppsPerJob = 2000;

    public sealed class StartRequest
    {
        /// <summary>appid или адреса store.steampowered.com/app/…; разделители — любые, строки с # — комментарии.</summary>
        public string? AppIds { get; set; }
        public bool UpdateExisting { get; set; }
        public bool RefreshPrices { get; set; }
        public bool RefreshCovers { get; set; }
    }

    [HttpPost]
    public async Task<IActionResult> Start([FromBody] StartRequest request)
    {
        var appIds = ParseAppIds(request.AppIds);
        if (appIds.Count == 0)
        {
            return BadRequest(new { message = "No Steam app ids found. Paste ids like 1091500 or links to store.steampowered.com/app/…" });
        }
        if (appIds.Count > MaxAppsPerJob)
        {
            return BadRequest(new { message = $"Too many games in one run ({appIds.Count}); the limit is {MaxAppsPerJob}." });
        }

        var job = new ImportJob
        {
            UserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "unknown",
            UserName = User.Identity?.Name ?? User.FindFirstValue("preferred_username") ?? "admin",
            StartedAt = DateTime.UtcNow,
            Status = $"queued 0/{appIds.Count}",
            Includes = [SteamImportWorker.JobKind],
        };
        await jobs.CreateAsync(job);

        var options = new SteamImportOptions
        {
            UpdateExisting = request.UpdateExisting,
            RefreshPrices = request.UpdateExisting && request.RefreshPrices,
            RefreshCovers = request.UpdateExisting && request.RefreshCovers,
        };
        if (!queue.TryEnqueue(new SteamImportRequest(job.Id, appIds, options)))
        {
            job.Status = "failed";
            job.FinishedAt = DateTime.UtcNow;
            await jobs.UpdateAsync(job);
            return StatusCode(503, new { message = "The import queue is not available." });
        }

        return Accepted(new { id = job.Id, total = appIds.Count });
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(string id)
    {
        var job = await jobs.GetByIdAsync(id);
        return job is null || !job.Includes.Contains(SteamImportWorker.JobKind) ? NotFound() : Ok(job);
    }

    [HttpGet]
    public async Task<IActionResult> Recent()
    {
        var recent = await jobs.GetRecentAsync(50);
        return Ok(recent.Where(j => j.Includes.Contains(SteamImportWorker.JobKind)).Take(10));
    }

    /// <summary>
    /// Стартовый каталог — около 550 популярных платных игр Steam, отобранных для магазина
    /// (см. комментарий в начале файла). Вшит в сборку, чтобы на сервере не нужен был репозиторий.
    /// </summary>
    [HttpGet("starter-catalog")]
    public async Task<IActionResult> StarterCatalog()
    {
        await using var stream = typeof(AdminSteamImportController).Assembly.GetManifestResourceStream("SteamImport.starter-catalog.txt");
        if (stream is null)
        {
            return NotFound();
        }
        using var reader = new StreamReader(stream);
        var text = await reader.ReadToEndAsync();
        return Ok(new { text, count = ParseAppIds(text).Count });
    }

    /// <summary>Номера из текста: голые числа и адреса страниц Steam; комментарии (#…) отбрасываются; без повторов.</summary>
    public static List<string> ParseAppIds(string? text)
    {
        var result = new List<string>();
        if (string.IsNullOrWhiteSpace(text))
        {
            return result;
        }
        var seen = new HashSet<string>();
        foreach (var rawLine in text.Split('\n'))
        {
            var line = rawLine;
            var comment = line.IndexOf('#');
            if (comment >= 0)
            {
                line = line[..comment];
            }
            foreach (Match match in AppIdPattern().Matches(line))
            {
                var id = match.Groups["url"].Success ? match.Groups["url"].Value : match.Groups["id"].Value;
                if (id.Length is > 0 and <= 9 && seen.Add(id))
                {
                    result.Add(id);
                }
            }
        }
        return result;
    }

    [GeneratedRegex(@"store\.steampowered\.com/app/(?<url>\d+)|(?<![\w/])(?<id>\d+)(?![\w/])", RegexOptions.IgnoreCase)]
    private static partial Regex AppIdPattern();
}
