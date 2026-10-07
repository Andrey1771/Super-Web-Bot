using System.Net;
using System.Text.Json;

namespace SuperBot.WebApi.Services.SteamImport;

/// <summary>
/// Карточка игры из Steam Store (store.steampowered.com/api/appdetails) — только то, что нужно
/// импорту каталога. Тексты на одном языке: за каждым языком — отдельный запрос.
/// </summary>
public sealed record SteamApp
{
    public required string AppId { get; init; }
    public required string Type { get; init; }
    public required string Name { get; init; }
    public bool IsFree { get; init; }
    public int RequiredAge { get; init; }
    public string? ControllerSupport { get; init; }
    public string ShortDescription { get; init; } = "";
    public string AboutTheGameHtml { get; init; } = "";
    public string SupportedLanguagesHtml { get; init; } = "";
    public string HeaderImage { get; init; } = "";
    public string? Website { get; init; }
    public string? PcRequirementsMinimumHtml { get; init; }
    public string? PcRequirementsRecommendedHtml { get; init; }
    public IReadOnlyList<string> Developers { get; init; } = [];
    public IReadOnlyList<string> Publishers { get; init; } = [];
    /// <summary>Цена без скидки в валюте запроса (cc), в центах. Нет — игра не продаётся (или ещё не вышла).</summary>
    public int? PriceInitialCents { get; init; }
    public string? PriceCurrency { get; init; }
    public bool Windows { get; init; }
    public bool Mac { get; init; }
    public bool Linux { get; init; }
    public int? MetacriticScore { get; init; }
    public IReadOnlyList<string> Categories { get; init; } = [];
    public IReadOnlyList<int> CategoryIds { get; init; } = [];
    public IReadOnlyList<string> Genres { get; init; } = [];
    public IReadOnlyList<string> GenreIds { get; init; } = [];
    public IReadOnlyList<SteamScreenshot> Screenshots { get; init; } = [];
    public IReadOnlyList<SteamMovie> Movies { get; init; } = [];
    public int RecommendationsTotal { get; init; }
    public bool ComingSoon { get; init; }
    /// <summary>Дата выхода как её пишет Steam: «Dec 9, 2020», «Q1 2027», «Coming soon»…</summary>
    public string? ReleaseDateText { get; init; }
    /// <summary>Коды описаний содержимого Steam: 3 — сексуальный контент для взрослых, 4 — откровенный.</summary>
    public IReadOnlyList<int> ContentDescriptorIds { get; init; } = [];
    public string? ContentDescriptorNotes { get; init; }
    public string? PegiRating { get; init; }
    public string? EsrbRating { get; init; }
    public IReadOnlyList<string> DlcAppIds { get; init; } = [];
    /// <summary>У DLC — appid игры, к которой оно (fullgame). У игр null.</summary>
    public string? FullGameAppId { get; init; }
}

/// <summary>Строка списка DLC игры (store/api/dlcforapp): хватает, чтобы решить, заводить ли DLC, не открывая его карточку.</summary>
public sealed record SteamDlcListing(string AppId, string Name, int? PriceInitialCents, string? Currency);

public sealed record SteamScreenshot(string ThumbnailUrl, string FullUrl);

/// <summary>Трейлер. Steam отдаёт его только потоком: HLS (m3u8) или DASH — mp4 больше нет.</summary>
public sealed record SteamMovie(string Id, string Name, string ThumbnailUrl, string? HlsUrl, string? DashH264Url, bool Highlight);

/// <summary>
/// Художественные материалы игры: имя ассета Steam (library_hero, main_capsule_2x, library_capsule_2x…)
/// → полный адрес на CDN. У новых игр файлы лежат в папках с хешем, угадать адрес нельзя.
/// </summary>
public sealed record SteamAssets(IReadOnlyDictionary<string, string> Urls)
{
    public string? Get(string name) => Urls.TryGetValue(name, out var url) ? url : null;
}

public interface ISteamStoreClient
{
    /// <summary>Адреса артов игры (api.steampowered.com, IStoreBrowseService/GetItems). null — Steam их не отдал.</summary>
    Task<SteamAssets?> GetAssetsAsync(string appId, CancellationToken ct);

    /// <summary>
    /// Карточка игры на языке <paramref name="language"/> (english, russian, ukrainian, polish) с ценой
    /// для страны <paramref name="countryCode"/>. null — Steam такой игры не отдаёт (снята с продажи,
    /// закрыта по региону, неверный id).
    /// </summary>
    Task<SteamApp?> GetAppAsync(string appId, string language, string countryCode, CancellationToken ct);

    /// <summary>Все DLC игры с ценой в долларах — одним запросом. null — Steam список не отдал.</summary>
    Task<IReadOnlyList<SteamDlcListing>?> GetDlcListAsync(string appId, CancellationToken ct);
}

/// <summary>
/// Клиент публичного API магазина Steam. Ключ не нужен, но есть негласный лимит — около 200
/// запросов за 5 минут с одного адреса; при превышении Steam отвечает 429 (иногда 403) на
/// несколько минут. Поэтому запросы идут строго по одному с паузой, а на отказ — ждём и повторяем.
/// </summary>
public sealed class SteamStoreClient : ISteamStoreClient
{
    /// <summary>
    /// Очередь к магазину (store.steampowered.com: appdetails, dlcforapp) и к Web API (api.steampowered.com: арты) —
    /// раздельно: лимиты у них свои, и запрос артов не должен занимать место запроса карточки.
    /// </summary>
    private static readonly RequestLane StoreLane = new();
    private static readonly RequestLane ApiLane = new();

    private readonly HttpClient _http;
    private readonly ILogger<SteamStoreClient> _logger;

    /// <summary>Пауза между запросами. 1.6 с ≈ 187 запросов за 5 минут — с запасом под лимит.</summary>
    internal static TimeSpan RequestInterval { get; set; } = TimeSpan.FromSeconds(1.6);
    internal static TimeSpan RateLimitBackoff { get; set; } = TimeSpan.FromSeconds(90);

    public SteamStoreClient(HttpClient http, ILogger<SteamStoreClient> logger)
    {
        _http = http;
        _logger = logger;
        _http.BaseAddress ??= new Uri("https://store.steampowered.com/");
    }

    public async Task<SteamApp?> GetAppAsync(string appId, string language, string countryCode, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(appId) || !appId.All(char.IsAsciiDigit))
        {
            throw new ArgumentException("Steam app id must be a number.", nameof(appId));
        }

        var url = $"api/appdetails?appids={appId}&cc={Uri.EscapeDataString(countryCode)}&l={Uri.EscapeDataString(language)}";
        for (var attempt = 1; ; attempt++)
        {
            using var response = await SendThrottledAsync(url, ct);
            if (response.StatusCode is HttpStatusCode.TooManyRequests or HttpStatusCode.Forbidden && attempt < 6)
            {
                _logger.LogWarning("Steam rate limit on app {AppId} (HTTP {Status}), waiting {Seconds} s", appId, (int)response.StatusCode, RateLimitBackoff.TotalSeconds);
                continue;
            }
            response.EnsureSuccessStatusCode();

            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            return Parse(appId, doc.RootElement);
        }
    }

    public async Task<IReadOnlyList<SteamDlcListing>?> GetDlcListAsync(string appId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(appId) || !appId.All(char.IsAsciiDigit))
        {
            throw new ArgumentException("Steam app id must be a number.", nameof(appId));
        }
        var url = $"api/dlcforapp/?appid={appId}&cc=us&l=english";
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                using var response = await SendThrottledAsync(url, ct);
                if (response.StatusCode is HttpStatusCode.TooManyRequests or HttpStatusCode.Forbidden && attempt < 6)
                {
                    _logger.LogWarning("Steam rate limit on DLC list of {AppId}, waiting {Seconds} s", appId, RateLimitBackoff.TotalSeconds);
                    continue;
                }
                if (!response.IsSuccessStatusCode)
                {
                    return null;
                }
                await using var stream = await response.Content.ReadAsStreamAsync(ct);
                using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
                return ParseDlcList(doc.RootElement);
            }
            catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException && !ct.IsCancellationRequested && attempt < 4)
            {
                _logger.LogWarning("Steam DLC list of {AppId} failed ({Message}), retrying", appId, ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(5 * attempt), ct);
            }
        }
    }

    /// <summary>Ответ dlcforapp: {"status":1,"dlc":[{"id":593380,"name":…,"price_overview":{"currency":"USD","initial":3999}}]}.</summary>
    public static IReadOnlyList<SteamDlcListing>? ParseDlcList(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object || Int(root, "status") != 1)
        {
            return null;
        }
        return Items(root, "dlc")
            .Select(d => (Id: Int(d, "id"), Name: Str(d, "name") ?? "", Price: Obj(d, "price_overview")))
            .Where(d => d.Id is > 0)
            .Select(d => new SteamDlcListing(
                d.Id!.Value.ToString(),
                d.Name,
                d.Price is { } p ? Int(p, "initial") : null,
                d.Price is { } c ? Str(c, "currency") : null))
            .ToList();
    }

    public async Task<SteamAssets?> GetAssetsAsync(string appId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(appId) || !appId.All(char.IsAsciiDigit))
        {
            throw new ArgumentException("Steam app id must be a number.", nameof(appId));
        }
        var input = $"{{\"ids\":[{{\"appid\":{appId}}}],\"context\":{{\"language\":\"english\",\"country_code\":\"US\"}},\"data_request\":{{\"include_assets\":true}}}}";
        var url = $"https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json={Uri.EscapeDataString(input)}";
        try
        {
            using var response = await SendThrottledAsync(url, ct);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }
            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            return ParseAssets(doc.RootElement);
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            _logger.LogWarning("Steam assets for app {AppId} unavailable: {Message}", appId, ex.Message);
            return null;
        }
    }

    /// <summary>Ответ GetItems: assets.asset_url_format «steam/apps/ID/${FILENAME}?t=…» и имена файлов.</summary>
    public static SteamAssets? ParseAssets(JsonElement root)
    {
        if (!root.TryGetProperty("response", out var response)
            || !response.TryGetProperty("store_items", out var items) || items.ValueKind != JsonValueKind.Array
            || items.GetArrayLength() == 0
            || !items[0].TryGetProperty("assets", out var assets) || assets.ValueKind != JsonValueKind.Object
            || Str(assets, "asset_url_format") is not { } format)
        {
            return null;
        }
        var urls = new Dictionary<string, string>();
        foreach (var property in assets.EnumerateObject())
        {
            var file = property.Value.ValueKind == JsonValueKind.String ? property.Value.GetString() : null;
            if (file is null || !file.Contains('.') || property.Name is "asset_url_format" or "page_background_path")
            {
                continue;
            }
            urls[property.Name] = "https://shared.akamai.steamstatic.com/store_item_assets/" + format.Replace("${FILENAME}", file);
        }
        return new SteamAssets(urls);
    }

    private async Task<HttpResponseMessage> SendThrottledAsync(string url, CancellationToken ct)
    {
        var lane = url.StartsWith("https://api.steampowered.com/", StringComparison.OrdinalIgnoreCase) ? ApiLane : StoreLane;
        await lane.WaitTurnAsync(RequestInterval, ct);
        var response = await _http.GetAsync(url, ct);
        if (response.StatusCode is HttpStatusCode.TooManyRequests or HttpStatusCode.Forbidden)
        {
            // Отказ по лимиту — пауза для всей очереди, а не только для этого запроса: соседние (импорт идёт
            // в несколько потоков) иначе продолжали бы стучаться и продлевали бы блокировку.
            lane.PauseFor(RateLimitBackoff);
        }
        return response;
    }

    /// <summary>
    /// Очередь запросов с паузой между их началами. Пауза отсчитывается от начала предыдущего запроса, а не от
    /// его конца: раньше ко 1,6 с паузы добавлялось время ответа (~0,6 с), и до лимита Steam не доходили на треть.
    /// Ответа следующий запрос не ждёт — только своей очереди.
    /// </summary>
    public sealed class RequestLane
    {
        private readonly SemaphoreSlim _gate = new(1, 1);
        private DateTime _nextStartUtc = DateTime.MinValue;

        public async Task WaitTurnAsync(TimeSpan interval, CancellationToken ct)
        {
            await _gate.WaitAsync(ct);
            try
            {
                var wait = _nextStartUtc - DateTime.UtcNow;
                if (wait > TimeSpan.Zero)
                {
                    await Task.Delay(wait, ct);
                }
                _nextStartUtc = DateTime.UtcNow + interval;
            }
            finally
            {
                _gate.Release();
            }
        }

        public void PauseFor(TimeSpan pause)
        {
            var until = DateTime.UtcNow + pause;
            lock (_gate)
            {
                if (until > _nextStartUtc)
                {
                    _nextStartUtc = until;
                }
            }
        }
    }

    /// <summary>Разбор ответа appdetails. Отдельно от сети — для тестов на сохранённых ответах.</summary>
    public static SteamApp? Parse(string appId, JsonElement root)
    {
        if (!root.TryGetProperty(appId, out var envelope)
            || !envelope.TryGetProperty("success", out var success) || success.ValueKind != JsonValueKind.True
            || !envelope.TryGetProperty("data", out var d) || d.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var price = Obj(d, "price_overview");
        var platforms = Obj(d, "platforms");
        var release = Obj(d, "release_date");
        var descriptors = Obj(d, "content_descriptors");
        var ratings = Obj(d, "ratings");
        // Требования: объект {minimum, recommended} или пустой массив, если их нет.
        var pcReq = Obj(d, "pc_requirements");

        return new SteamApp
        {
            AppId = appId,
            Type = Str(d, "type") ?? "",
            Name = Str(d, "name") ?? "",
            IsFree = Bool(d, "is_free"),
            RequiredAge = Int(d, "required_age") ?? 0,
            ControllerSupport = Str(d, "controller_support"),
            ShortDescription = Str(d, "short_description") ?? "",
            AboutTheGameHtml = Str(d, "about_the_game") ?? "",
            SupportedLanguagesHtml = Str(d, "supported_languages") ?? "",
            HeaderImage = Str(d, "header_image") ?? "",
            Website = Str(d, "website"),
            PcRequirementsMinimumHtml = pcReq is { } r1 ? Str(r1, "minimum") : null,
            PcRequirementsRecommendedHtml = pcReq is { } r2 ? Str(r2, "recommended") : null,
            Developers = Strings(d, "developers"),
            Publishers = Strings(d, "publishers"),
            PriceInitialCents = price is { } p ? Int(p, "initial") : null,
            PriceCurrency = price is { } pc ? Str(pc, "currency") : null,
            Windows = platforms is { } w && Bool(w, "windows"),
            Mac = platforms is { } m && Bool(m, "mac"),
            Linux = platforms is { } l && Bool(l, "linux"),
            MetacriticScore = Obj(d, "metacritic") is { } mc ? Int(mc, "score") : null,
            Categories = Items(d, "categories").Select(c => Str(c, "description") ?? "").Where(s => s.Length > 0).ToList(),
            CategoryIds = Items(d, "categories").Select(c => Int(c, "id")).OfType<int>().ToList(),
            Genres = Items(d, "genres").Select(g => Str(g, "description") ?? "").Where(s => s.Length > 0).ToList(),
            GenreIds = Items(d, "genres").Select(g => Str(g, "id") ?? "").Where(s => s.Length > 0).ToList(),
            Screenshots = Items(d, "screenshots")
                .Select(s => new SteamScreenshot(Str(s, "path_thumbnail") ?? "", Str(s, "path_full") ?? ""))
                .Where(s => s.FullUrl.Length > 0)
                .ToList(),
            Movies = Items(d, "movies")
                .Select(mv => new SteamMovie(
                    Str(mv, "id") ?? "",
                    Str(mv, "name") ?? "",
                    Str(mv, "thumbnail") ?? "",
                    Str(mv, "hls_h264"),
                    Str(mv, "dash_h264"),
                    Bool(mv, "highlight")))
                .Where(mv => mv.HlsUrl is not null || mv.DashH264Url is not null)
                .ToList(),
            RecommendationsTotal = Obj(d, "recommendations") is { } rec ? Int(rec, "total") ?? 0 : 0,
            ComingSoon = release is { } rs && Bool(rs, "coming_soon"),
            ReleaseDateText = release is { } rd ? Str(rd, "date") : null,
            ContentDescriptorIds = descriptors is { } cd ? Items(cd, "ids").Select(AsInt).OfType<int>().ToList() : [],
            ContentDescriptorNotes = descriptors is { } cn ? Str(cn, "notes") : null,
            PegiRating = ratings is { } rp && Obj(rp, "pegi") is { } pegi ? Str(pegi, "rating") : null,
            EsrbRating = ratings is { } re && Obj(re, "esrb") is { } esrb ? Str(esrb, "rating") : null,
            DlcAppIds = Items(d, "dlc").Select(AsInt).OfType<int>().Select(i => i.ToString()).ToList(),
            FullGameAppId = Obj(d, "fullgame") is { } full ? Str(full, "appid") : null,
        };
    }

    private static JsonElement? Obj(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Object ? v : null;

    private static IEnumerable<JsonElement> Items(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Array ? v.EnumerateArray() : [];

    private static string? Str(JsonElement e, string name)
    {
        if (!e.TryGetProperty(name, out var v)) return null;
        return v.ValueKind switch
        {
            JsonValueKind.String => v.GetString(),
            JsonValueKind.Number => v.GetRawText(),
            _ => null,
        };
    }

    private static IReadOnlyList<string> Strings(JsonElement e, string name) =>
        Items(e, name).Where(i => i.ValueKind == JsonValueKind.String).Select(i => i.GetString()!.Trim()).Where(s => s.Length > 0).ToList();

    private static bool Bool(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && (v.ValueKind == JsonValueKind.True || (v.ValueKind == JsonValueKind.String && v.GetString() == "true"));

    /// <summary>Steam пишет числа то числом, то строкой («required_age»: "17").</summary>
    private static int? Int(JsonElement e, string name) => e.TryGetProperty(name, out var v) ? AsInt(v) : null;

    private static int? AsInt(JsonElement v) => v.ValueKind switch
    {
        JsonValueKind.Number when v.TryGetInt32(out var i) => i,
        JsonValueKind.String when int.TryParse(v.GetString(), out var s) => s,
        _ => null,
    };
}
