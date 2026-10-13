namespace SuperBot.WebApi.Models
{
    public class AnalyticsOverviewDto
    {
        public AnalyticsTotalsDto Totals { get; set; }
        public List<AnalyticsTimeseriesPointDto> Timeseries { get; set; }
        public List<AnalyticsTopEntryDto> TopPages { get; set; }
        public List<AnalyticsTopEntryDto> TopItems { get; set; }
    }

    public class AnalyticsTotalsDto
    {
        public double Users { get; set; }
        public double Sessions { get; set; }
        public double Pageviews { get; set; }
        public double Purchases { get; set; }
        public double Revenue { get; set; }
    }

    public class AnalyticsTimeseriesPointDto
    {
        public string Date { get; set; }
        public double Users { get; set; }
        public double Sessions { get; set; }
        public double Pageviews { get; set; }
    }

    public class AnalyticsTopEntryDto
    {
        public string Name { get; set; }
        public double Value { get; set; }
    }
}
