namespace SuperBot.Core.Entities
{
    public class AnalyticsSettings
    {
        public string Id { get; set; }
        public string GaMeasurementId { get; set; }
        public string GaPropertyId { get; set; }
        public string GtmContainerId { get; set; }
        public string YandexCounterId { get; set; }
        public bool IsEnabled { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
