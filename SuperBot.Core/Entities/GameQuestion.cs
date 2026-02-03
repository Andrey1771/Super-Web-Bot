using System;
using System.Collections.Generic;

namespace SuperBot.Core.Entities
{
    public class GameQuestion
    {
        public string Id { get; set; }
        public string GameId { get; set; }
        public string UserId { get; set; }
        public string UserName { get; set; }
        public string Question { get; set; }
        public DateTime CreatedAt { get; set; }
        public List<GameAnswer> Answers { get; set; } = new();
    }

    public class GameAnswer
    {
        public string Id { get; set; }
        public string UserId { get; set; }
        public string UserName { get; set; }
        public string Text { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
