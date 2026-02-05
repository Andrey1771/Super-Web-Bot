using System;

namespace SuperBot.Core.Entities
{
    public class GameTrackingEvent
    {
        public string Id { get; set; }
        public string GameId { get; set; }
        public string UserId { get; set; }
        public string AnonId { get; set; }
        public string EventType { get; set; }
        public string MediaId { get; set; }
        public string MediaType { get; set; }
        public DateTime Timestamp { get; set; }
    }
}
