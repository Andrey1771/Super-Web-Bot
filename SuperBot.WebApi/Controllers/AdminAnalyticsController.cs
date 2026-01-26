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
    private readonly YandexMetrikaClient _yandexClient;

    public AdminAnalyticsController(
        IAnalyticsSettingsRepository settingsRepository,
        Ga4Client ga4Client,
        YandexMetrikaClient yandexClient)
    {
        _settingsRepository = settingsRepository;
        _ga4Client = ga4Client;
        _yandexClient = yandexClient;
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
        settings.YandexCounterId = request.YandexCounterId?.Trim();
        settings.IsEnabled = request.IsEnabled;
        settings.UpdatedAt = now;

        await _settingsRepository.UpsertAsync(settings);
        return Ok(ToDto(settings));
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var settings = await _settingsRepository.GetAsync();
        var ga4Status = await CheckGa4ConnectionAsync(settings);
        var yandexStatus = await CheckYandexConnectionAsync(settings);
        return Ok(new { ga4 = ga4Status, yandex = yandexStatus });
    }

    [HttpPost("test")]
    public async Task<IActionResult> TestConnection([FromBody] AnalyticsTestRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Provider))
        {
            return BadRequest("Provider is required.");
        }

        var settings = await _settingsRepository.GetAsync();
        var provider = request.Provider.Trim().ToLowerInvariant();

        return provider switch
        {
            "ga4" => Ok(new { status = await CheckGa4ConnectionAsync(settings) }),
            "yandex" => Ok(new { status = await CheckYandexConnectionAsync(settings) }),
            _ => BadRequest("Unknown provider.")
        };
    }

    [HttpGet("ga4/overview")]
    public async Task<IActionResult> GetGa4Overview([FromQuery] string range = "7d")
    {
        var settings = await _settingsRepository.GetAsync();
        if (!IsAnalyticsEnabled(settings) || string.IsNullOrWhiteSpace(settings.GaPropertyId))
        {
            return BadRequest("Google Analytics is not configured.");
        }

        var (startDate, endDate) = GetDateRange(range);
        var totalsRequest = new
        {
            dateRanges = new[] { new { startDate, endDate } },
            metrics = new[]
            {
                new { name = "activeUsers" },
                new { name = "sessions" },
                new { name = "screenPageViews" },
                new { name = "purchases" },
                new { name = "purchaseRevenue" }
            }
        };

        var totalsDoc = await _ga4Client.RunReportAsync(settings.GaPropertyId, totalsRequest);
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

        var timeseriesDoc = await _ga4Client.RunReportAsync(settings.GaPropertyId, timeseriesRequest);
        var timeseries = ParseTimeseries(timeseriesDoc);

        var topPagesRequest = new
        {
            dateRanges = new[] { new { startDate, endDate } },
            metrics = new[] { new { name = "screenPageViews" } },
            dimensions = new[] { new { name = "pagePath" } },
            orderBys = new[] { new { metric = new { metricName = "screenPageViews" }, desc = true } },
            limit = 5
        };

        var topPagesDoc = await _ga4Client.RunReportAsync(settings.GaPropertyId, topPagesRequest);
        var topPages = ParseTopEntries(topPagesDoc);

        var topItemsRequest = new
        {
            dateRanges = new[] { new { startDate, endDate } },
            metrics = new[] { new { name = "itemViews" } },
            dimensions = new[] { new { name = "itemName" } },
            orderBys = new[] { new { metric = new { metricName = "itemViews" }, desc = true } },
            limit = 5
        };

        var topItemsDoc = await _ga4Client.RunReportAsync(settings.GaPropertyId, topItemsRequest);
        var topItems = ParseTopEntries(topItemsDoc);

        return Ok(new AnalyticsOverviewDto
        {
            Totals = totals,
            Timeseries = timeseries,
            TopPages = topPages,
            TopItems = topItems
        });
    }

    [HttpGet("yandex/overview")]
    public async Task<IActionResult> GetYandexOverview([FromQuery] string range = "7d")
    {
        var settings = await _settingsRepository.GetAsync();
        if (!IsAnalyticsEnabled(settings) || string.IsNullOrWhiteSpace(settings.YandexCounterId))
        {
            return BadRequest("Yandex Metrika is not configured.");
        }

        var (startDate, endDate) = GetDateRange(range);

        var totalsDoc = await _yandexClient.GetStatsAsync(settings.YandexCounterId, new Dictionary<string, string>
        {
            ["metrics"] = "ym:s:users,ym:s:sessions,ym:s:pageviews",
            ["date1"] = startDate,
            ["date2"] = endDate
        });

        var totals = ParseYandexTotals(totalsDoc);

        var timeseriesDoc = await _yandexClient.GetStatsAsync(settings.YandexCounterId, new Dictionary<string, string>
        {
            ["metrics"] = "ym:s:users,ym:s:sessions,ym:s:pageviews",
            ["dimensions"] = "ym:s:date",
            ["date1"] = startDate,
            ["date2"] = endDate
        });

        var timeseries = ParseYandexTimeseries(timeseriesDoc);

        var topPagesDoc = await _yandexClient.GetStatsAsync(settings.YandexCounterId, new Dictionary<string, string>
        {
            ["metrics"] = "ym:s:pageviews",
            ["dimensions"] = "ym:s:pagePath",
            ["date1"] = startDate,
            ["date2"] = endDate,
            ["limit"] = "5"
        });

        var topPages = ParseYandexTopEntries(topPagesDoc);

        return Ok(new AnalyticsOverviewDto
        {
            Totals = totals,
            Timeseries = timeseries,
            TopPages = topPages,
            TopItems = new List<AnalyticsTopEntryDto>()
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
            YandexCounterId = settings.YandexCounterId,
            IsEnabled = settings.IsEnabled
        };
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

    private static AnalyticsTotalsDto ParseYandexTotals(JsonDocument doc)
    {
        if (!doc.RootElement.TryGetProperty("totals", out var totalsElement) || totalsElement.GetArrayLength() == 0)
        {
            return new AnalyticsTotalsDto();
        }

        var totals = totalsElement[0].EnumerateArray().Select(value =>
        {
            return double.TryParse(value.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0;
        }).ToArray();

        return new AnalyticsTotalsDto
        {
            Users = totals.ElementAtOrDefault(0),
            Sessions = totals.ElementAtOrDefault(1),
            Pageviews = totals.ElementAtOrDefault(2),
            Purchases = 0,
            Revenue = 0
        };
    }

    private static List<AnalyticsTimeseriesPointDto> ParseYandexTimeseries(JsonDocument doc)
    {
        var list = new List<AnalyticsTimeseriesPointDto>();
        if (!doc.RootElement.TryGetProperty("data", out var dataElement))
        {
            return list;
        }

        foreach (var item in dataElement.EnumerateArray())
        {
            var dimension = item.GetProperty("dimensions")[0].GetProperty("name").GetString();
            var metrics = item.GetProperty("metrics").EnumerateArray().Select(value =>
            {
                return double.TryParse(value.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0;
            }).ToArray();

            list.Add(new AnalyticsTimeseriesPointDto
            {
                Date = dimension,
                Users = metrics.ElementAtOrDefault(0),
                Sessions = metrics.ElementAtOrDefault(1),
                Pageviews = metrics.ElementAtOrDefault(2)
            });
        }

        return list;
    }

    private static List<AnalyticsTopEntryDto> ParseYandexTopEntries(JsonDocument doc)
    {
        var list = new List<AnalyticsTopEntryDto>();
        if (!doc.RootElement.TryGetProperty("data", out var dataElement))
        {
            return list;
        }

        foreach (var item in dataElement.EnumerateArray())
        {
            var name = item.GetProperty("dimensions")[0].GetProperty("name").GetString();
            var metricValue = item.GetProperty("metrics")[0].ToString();
            if (!double.TryParse(metricValue, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
            {
                parsed = 0;
            }
            list.Add(new AnalyticsTopEntryDto { Name = name, Value = parsed });
        }

        return list;
    }

    private async Task<string> CheckGa4ConnectionAsync(AnalyticsSettings settings)
    {
        if (!IsAnalyticsEnabled(settings) || string.IsNullOrWhiteSpace(settings.GaPropertyId))
        {
            return "not_configured";
        }

        try
        {
            var (startDate, endDate) = GetDateRange("7d");
            var payload = new
            {
                dateRanges = new[] { new { startDate, endDate } },
                metrics = new[] { new { name = "activeUsers" } }
            };
            await _ga4Client.RunReportAsync(settings.GaPropertyId, payload);
            return "connected";
        }
        catch
        {
            return "error";
        }
    }

    private async Task<string> CheckYandexConnectionAsync(AnalyticsSettings settings)
    {
        if (!IsAnalyticsEnabled(settings) || string.IsNullOrWhiteSpace(settings.YandexCounterId))
        {
            return "not_configured";
        }

        try
        {
            var (startDate, endDate) = GetDateRange("7d");
            await _yandexClient.GetStatsAsync(settings.YandexCounterId, new Dictionary<string, string>
            {
                ["metrics"] = "ym:s:users",
                ["date1"] = startDate,
                ["date2"] = endDate
            });
            return "connected";
        }
        catch
        {
            return "error";
        }
    }
    public class AnalyticsSettingsRequest
    {
        public string GaMeasurementId { get; set; }
        public string GaPropertyId { get; set; }
        public string GtmContainerId { get; set; }
        public string YandexCounterId { get; set; }
        public bool IsEnabled { get; set; }
    }

    public class AnalyticsSettingsResponse
    {
        public string GaMeasurementId { get; set; }
        public string GaPropertyId { get; set; }
        public string GtmContainerId { get; set; }
        public string YandexCounterId { get; set; }
        public bool IsEnabled { get; set; }
    }

    public class AnalyticsTestRequest
    {
        public string Provider { get; set; }
    }
}
