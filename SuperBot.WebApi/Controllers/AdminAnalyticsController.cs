using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Models;
using SuperBot.WebApi.Services.Analytics;
using System.Globalization;
using System.Linq;
using System.Text.Json;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/admin/analytics")]
[Authorize(Roles = "admin")]
public class AdminAnalyticsController : ControllerBase
{
    private readonly IAnalyticsSettingsRepository _settingsRepository;
    private readonly Ga4Client _ga4Client;
    private readonly ILogger<AdminAnalyticsController> _logger;

    public AdminAnalyticsController(
        IAnalyticsSettingsRepository settingsRepository,
        Ga4Client ga4Client,
        ILogger<AdminAnalyticsController> logger)
    {
        _settingsRepository = settingsRepository;
        _ga4Client = ga4Client;
        _logger = logger;
    }

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings()
    {
        var settings = await _settingsRepository.GetAsync();
        return Ok(ToDto(settings));
    }

    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] AnalyticsSettingsRequest request)
    {
        if (request == null)
        {
            return BadRequest("Settings payload is required.");
        }

        var existing = await _settingsRepository.GetAsync();
        var now = DateTime.UtcNow;
        var settings = existing ?? new AnalyticsSettings { CreatedAt = now };
        settings.GaMeasurementId = request.GaMeasurementId?.Trim();
        settings.GaPropertyId = request.GaPropertyId?.Trim();
        settings.GtmContainerId = request.GtmContainerId?.Trim();
        // Пустое поле — «оставить как есть»: секрет наружу не отдаётся, форма его не знает.
        if (!string.IsNullOrWhiteSpace(request.GaApiSecret))
        {
            settings.GaApiSecret = request.GaApiSecret.Trim();
        }

        // Client ID секретом не является и приходит из формы как обычное поле — вплоть до
        // очистки. Два других живут по правилу секрета: пусто значит «не менять».
        settings.GaOauthClientId = request.GaOauthClientId?.Trim();
        if (!string.IsNullOrWhiteSpace(request.GaOauthClientSecret))
        {
            settings.GaOauthClientSecret = request.GaOauthClientSecret.Trim();
        }
        if (!string.IsNullOrWhiteSpace(request.GaOauthRefreshToken))
        {
            settings.GaOauthRefreshToken = request.GaOauthRefreshToken.Trim();
            settings.GaOauthRefreshTokenSavedAt = now;
        }
        settings.IsEnabled = request.IsEnabled;
        settings.UpdatedAt = now;

        await _settingsRepository.UpsertAsync(settings);
        return Ok(ToDto(settings));
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var settings = await _settingsRepository.GetAsync();
        var (ga4Status, ga4Detail) = await CheckGa4ConnectionAsync(settings);

        // Заодно отвечаем, чего именно не хватает для чтения отчётов. Одного слова
        // «not_configured» мало: заполнить надо три поля, и какое из них пусто — вопрос,
        // на который иначе не ответить.
        return Ok(new
        {
            ga4 = ga4Status,
            // Слова Google, если отказ пришёл от него. Пусто — значит отказа не было.
            ga4Detail,
            // Когда сохранён токен: по нему видно, не подошла ли к концу неделя, после которой
            // Google гасит токены приложений в статусе Testing.
            refreshTokenSavedAtUtc = settings?.GaOauthRefreshTokenSavedAt,
            reportAccess = new
            {
                configured = _ga4Client.HasCredentials(settings),
                missing = _ga4Client.MissingCredentials(settings)
            }
        });
    }

    [HttpGet("ga4/overview")]
    public async Task<IActionResult> GetGa4Overview([FromQuery] string range = "7d")
    {
        var settings = await _settingsRepository.GetAsync();
        if (!IsAnalyticsEnabled(settings) || string.IsNullOrWhiteSpace(settings.GaPropertyId))
        {
            return BadRequest(new
            {
                code = "not_configured",
                message = "Analytics is off or the Property ID is empty — fill them in on the settings page."
            });
        }

        // Доступ на ЧТЕНИЕ отчётов — отдельный от всего, что заполняется в форме настроек.
        // Совпадение «три поля там и три переменные здесь» сбивает с толку, поэтому текст
        // начинается с объяснения, а не со списка имён: иначе он читается как «вы не заполнили
        // то, что заполнили».
        if (!_ga4Client.HasCredentials(settings))
        {
            return BadRequest(new
            {
                code = "report_access_missing",
                message = "The IDs on the settings page let the shop SEND data to Google. Showing those reports "
                    + "inside this panel additionally needs an OAuth client from Google Cloud Console — a different "
                    + "service. Fill it in under Report access on the settings page; still missing: "
                    + string.Join(", ", _ga4Client.MissingCredentials(settings))
                    + ". Until then the reports are available on the Google Analytics site itself, and data "
                    + "collection is not affected."
            });
        }

        var (startDate, endDate) = GetDateRange(range);
        // Всё, что общается с Google, — под одним catch: любой отказ снаружи должен
        // превращаться в объяснение, а не в 500 без текста.
        try
        {
            var totalsRequest = new
            {
                dateRanges = new[] { new { startDate, endDate } },
                metrics = new[]
                {
                    new { name = "activeUsers" },
                    new { name = "sessions" },
                    new { name = "screenPageViews" },
                    // Именно ecommercePurchases: у Data API имена метрик свои и с именами
                    // событий не совпадают. «purchases» отвергается вместе со всем запросом.
                    new { name = "ecommercePurchases" },
                    new { name = "purchaseRevenue" }
                }
            };

            var totalsDoc = await _ga4Client.RunReportAsync(settings.GaPropertyId, totalsRequest, settings);
            var totals = ParseTotals(totalsDoc);

            var timeseriesRequest = new
            {
                dateRanges = new[] { new { startDate, endDate } },
                metrics = new[]
                {
                    new { name = "activeUsers" },
                    new { name = "sessions" },
                    new { name = "screenPageViews" }
                },
                dimensions = new[] { new { name = "date" } },
                orderBys = new[] { new { dimension = new { dimensionName = "date" } } }
            };

            var timeseriesDoc = await _ga4Client.RunReportAsync(settings.GaPropertyId, timeseriesRequest, settings);
            var timeseries = ParseTimeseries(timeseriesDoc);

            var topPagesRequest = new
            {
                dateRanges = new[] { new { startDate, endDate } },
                metrics = new[] { new { name = "screenPageViews" } },
                dimensions = new[] { new { name = "pagePath" } },
                orderBys = new[] { new { metric = new { metricName = "screenPageViews" }, desc = true } },
                limit = 5
            };

            var topPagesDoc = await _ga4Client.RunReportAsync(settings.GaPropertyId, topPagesRequest, settings);
            var topPages = ParseTopEntries(topPagesDoc);

            var topItemsRequest = new
            {
                dateRanges = new[] { new { startDate, endDate } },
                metrics = new[] { new { name = "itemsViewed" } },
                dimensions = new[] { new { name = "itemName" } },
                orderBys = new[] { new { metric = new { metricName = "itemsViewed" }, desc = true } },
                limit = 5
            };

            var topItemsDoc = await _ga4Client.RunReportAsync(settings.GaPropertyId, topItemsRequest, settings);
            var topItems = ParseTopEntries(topItemsDoc);

            return Ok(new AnalyticsOverviewDto
            {
                Totals = totals,
                Timeseries = timeseries,
                TopPages = topPages,
                TopItems = topItems
            });
        }
        catch (Exception ex)
        {
            return Ga4Unavailable(ex);
        }
    }

    /// <summary>
    /// Отказ самого Google. Наружу отдаём объяснение, а не текст исключения: в нём бывают
    /// куски запроса и заголовков, а разбираться в них всё равно придётся по логам.
    /// </summary>
    private IActionResult Ga4Unavailable(Exception ex)
    {
        _logger.LogWarning(ex, "GA4 report request failed");

        // Пересказывать Google своими словами стоит только там, где он промолчал. Когда он
        // объяснил отказ сам, его объяснение точнее любой нашей догадки.
        if (ex is Ga4AccessException google)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                code = google.Code == "token_rejected" ? "report_access_expired" : "ga_refused",
                message = google.Code == "token_rejected"
                    ? $"Google no longer accepts the refresh token: {google.Message} Get a new one and save it "
                        + "under Report access. If the Cloud Console app is still in Testing, publish it — "
                        + "otherwise the next token expires in 7 days too."
                    : google.Message
            });
        }

        return StatusCode(StatusCodes.Status502BadGateway, new
        {
            code = "ga_unreachable",
            message = "Could not reach Google Analytics. The service may be temporarily unavailable — try again in a minute."
        });
    }


    private static AnalyticsSettingsResponse ToDto(AnalyticsSettings settings)
    {
        if (settings == null)
        {
            return new AnalyticsSettingsResponse();
        }

        return new AnalyticsSettingsResponse
        {
            GaMeasurementId = settings.GaMeasurementId,
            GaPropertyId = settings.GaPropertyId,
            GtmContainerId = settings.GtmContainerId,
            // Сам секрет не отдаём даже админу — только признак, что он задан, и огрызок для
            // опознания. Показывать ключ целиком значит разложить его по истории запросов и
            // логам браузера.
            HasGaApiSecret = !string.IsNullOrWhiteSpace(settings.GaApiSecret),
            GaApiSecretHint = MaskSecret(settings.GaApiSecret),
            GaOauthClientId = settings.GaOauthClientId,
            HasGaOauthClientSecret = !string.IsNullOrWhiteSpace(settings.GaOauthClientSecret),
            GaOauthClientSecretHint = MaskSecret(settings.GaOauthClientSecret),
            HasGaOauthRefreshToken = !string.IsNullOrWhiteSpace(settings.GaOauthRefreshToken),
            GaOauthRefreshTokenHint = MaskSecret(settings.GaOauthRefreshToken),
            IsEnabled = settings.IsEnabled
        };
    }

    /// <summary>
    /// Огрызок секрета для опознания: начало и конец, середина закрыта. Нужен, чтобы админ мог
    /// отличить один сохранённый ключ от другого, не видя ни одного целиком — например, понять,
    /// что после ротации в поле лежит уже новый.
    ///
    /// Длина маски фиксированная и настоящую длину ключа не выдаёт. Короткие значения
    /// закрываются целиком: у них открытые края — это уже заметная часть секрета.
    /// </summary>
    private static string? MaskSecret(string? secret)
    {
        if (string.IsNullOrWhiteSpace(secret))
        {
            return null;
        }

        const string Mask = "••••••••";
        var value = secret.Trim();
        return value.Length < 12
            ? Mask
            : $"{value[..2]}{Mask}{value[^4..]}";
    }

    private static bool IsAnalyticsEnabled(AnalyticsSettings settings)
    {
        return settings != null && settings.IsEnabled;
    }

    private static (string startDate, string endDate) GetDateRange(string range)
    {
        var today = DateTime.UtcNow.Date;
        var days = range?.Trim().ToLowerInvariant() == "30d" ? 30 : 7;
        var start = today.AddDays(-days + 1);
        return (start.ToString("yyyy-MM-dd"), today.ToString("yyyy-MM-dd"));
    }

    private static AnalyticsTotalsDto ParseTotals(JsonDocument doc)
    {
        if (!doc.RootElement.TryGetProperty("totals", out var totalsElement) || totalsElement.GetArrayLength() == 0)
        {
            return new AnalyticsTotalsDto();
        }

        var values = totalsElement[0].GetProperty("metricValues").EnumerateArray().Select((value, index) =>
        {
            var raw = value.GetProperty("value").GetString();
            return double.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0;
        }).ToArray();

        return new AnalyticsTotalsDto
        {
            Users = values.ElementAtOrDefault(0),
            Sessions = values.ElementAtOrDefault(1),
            Pageviews = values.ElementAtOrDefault(2),
            Purchases = values.ElementAtOrDefault(3),
            Revenue = values.ElementAtOrDefault(4)
        };
    }

    private static List<AnalyticsTimeseriesPointDto> ParseTimeseries(JsonDocument doc)
    {
        var list = new List<AnalyticsTimeseriesPointDto>();
        if (!doc.RootElement.TryGetProperty("rows", out var rows))
        {
            return list;
        }

        foreach (var row in rows.EnumerateArray())
        {
            var date = row.GetProperty("dimensionValues")[0].GetProperty("value").GetString();
            var values = row.GetProperty("metricValues").EnumerateArray().Select(value =>
            {
                var raw = value.GetProperty("value").GetString();
                return double.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0;
            }).ToArray();

            list.Add(new AnalyticsTimeseriesPointDto
            {
                Date = date,
                Users = values.ElementAtOrDefault(0),
                Sessions = values.ElementAtOrDefault(1),
                Pageviews = values.ElementAtOrDefault(2)
            });
        }

        return list;
    }

    private static List<AnalyticsTopEntryDto> ParseTopEntries(JsonDocument doc)
    {
        var list = new List<AnalyticsTopEntryDto>();
        if (!doc.RootElement.TryGetProperty("rows", out var rows))
        {
            return list;
        }

        foreach (var row in rows.EnumerateArray())
        {
            var name = row.GetProperty("dimensionValues")[0].GetProperty("value").GetString();
            var value = row.GetProperty("metricValues")[0].GetProperty("value").GetString();
            if (!double.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
            {
                parsed = 0;
            }
            list.Add(new AnalyticsTopEntryDto { Name = name, Value = parsed });
        }

        return list;
    }




    /// <summary>
    /// Проверка доступа к отчётам. Возвращает не только исход, но и слова Google, если отказ
    /// пришёл от него: без них «error» ничем не помогает — непонятно, истёк ли токен, не тот ли
    /// ресурс указан или у аккаунта нет прав. Пустое объяснение означает, что Google молчал.
    /// </summary>
    private async Task<(string Status, string Detail)> CheckGa4ConnectionAsync(AnalyticsSettings settings)
    {
        if (!IsAnalyticsEnabled(settings) || string.IsNullOrWhiteSpace(settings.GaPropertyId))
        {
            return ("not_configured", null);
        }

        // Чтение отчётов идёт через Google Analytics Data API, а он требует отдельного доступа
        // OAuth. Его отсутствие — не поломка связи, а незаконченная настройка, и называть это
        // ошибкой значит отправить админа искать несуществующую проблему в идентификаторах.
        if (!_ga4Client.HasCredentials(settings))
        {
            return ("not_configured", null);
        }

        try
        {
            var (startDate, endDate) = GetDateRange("7d");
            var payload = new
            {
                dateRanges = new[] { new { startDate, endDate } },
                metrics = new[] { new { name = "activeUsers" } }
            };
            await _ga4Client.RunReportAsync(settings.GaPropertyId, payload, settings);
            return ("connected", null);
        }
        catch (Ga4AccessException ex)
        {
            _logger.LogWarning(ex, "GA4 access check failed: {Code}", ex.Code);
            // Отклонённый токен — отдельный исход: чинится он не так, как всё остальное.
            return (ex.Code == "token_rejected" ? "token_rejected" : "error", ex.Message);
        }
        catch (Exception ex)
        {
            // Сеть, таймаут, неожиданный ответ — Google тут ни при чём, и его слов у нас нет.
            _logger.LogWarning(ex, "GA4 access check failed");
            return ("error", null);
        }
    }

    /// <summary>
    /// Все поля необязательные, и это важно: у проекта включены nullable-ссылки, а [ApiController]
    /// считает обязательным каждое ненулевое строковое свойство. С «string» вместо «string?»
    /// форма, которая не прислала поле, получала 400 — например, при повторном сохранении, когда
    /// секрет уже сохранён и заново не вводится.
    /// </summary>
    public class AnalyticsSettingsRequest
    {
        public string? GaMeasurementId { get; set; }
        public string? GaPropertyId { get; set; }
        public string? GtmContainerId { get; set; }
        /// <summary>
        /// Секрет Measurement Protocol. Пустая строка означает «не менять»: наружу секрет не
        /// отдаётся, и форма присылает пустое поле, если админ его не трогал. Без этого правила
        /// первое же сохранение настроек стирало бы ключ.
        /// </summary>
        public string? GaApiSecret { get; set; }

        /// <summary>Доступ на чтение отчётов. Секретные два — по правилу «пусто значит не менять».</summary>
        public string? GaOauthClientId { get; set; }
        public string? GaOauthClientSecret { get; set; }
        public string? GaOauthRefreshToken { get; set; }

        public bool IsEnabled { get; set; }
    }

    public class AnalyticsSettingsResponse
    {
        public string? GaMeasurementId { get; set; }
        public string? GaPropertyId { get; set; }
        public string? GtmContainerId { get; set; }

        /// <summary>Задан ли секрет Measurement Protocol. Сам ключ наружу не отдаётся.</summary>
        public bool HasGaApiSecret { get; set; }

        /// <summary>Начало и конец сохранённого секрета — чтобы его можно было опознать, но не прочитать.</summary>
        public string? GaApiSecretHint { get; set; }

        /// <summary>Логин программы секретом не является и отдаётся как есть.</summary>
        public string? GaOauthClientId { get; set; }

        public bool HasGaOauthClientSecret { get; set; }
        public string? GaOauthClientSecretHint { get; set; }
        public bool HasGaOauthRefreshToken { get; set; }
        public string? GaOauthRefreshTokenHint { get; set; }

        public bool IsEnabled { get; set; }
    }

}
