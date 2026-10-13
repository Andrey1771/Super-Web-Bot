using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class ImportJobDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("userId")]
        public string UserId { get; set; }

        [BsonElement("userName")]
        public string UserName { get; set; }

        [BsonElement("startedAt")]
        public DateTime StartedAt { get; set; }

        [BsonElement("finishedAt")]
        public DateTime? FinishedAt { get; set; }

        [BsonElement("status")]
        public string Status { get; set; }

        [BsonElement("dryRun")]
        public bool DryRun { get; set; }

        [BsonElement("stats")]
        public ImportJobStatsDb Stats { get; set; } = new();

        [BsonElement("errors")]
        public List<ImportIssueDb> Errors { get; set; } = new();

        [BsonElement("warnings")]
        public List<ImportIssueDb> Warnings { get; set; } = new();

        [BsonElement("includes")]
        public string[] Includes { get; set; } = Array.Empty<string>();
    }

    public class ImportJobStatsDb
    {
        [BsonElement("gamesCreated")]
        public int GamesCreated { get; set; }

        [BsonElement("gamesUpdated")]
        public int GamesUpdated { get; set; }

        [BsonElement("gamesSkipped")]
        public int GamesSkipped { get; set; }

        [BsonElement("blogCreated")]
        public int BlogCreated { get; set; }

        [BsonElement("blogUpdated")]
        public int BlogUpdated { get; set; }

        [BsonElement("blogSkipped")]
        public int BlogSkipped { get; set; }

        [BsonElement("mediaCreated")]
        public int MediaCreated { get; set; }

        [BsonElement("mediaSkipped")]
        public int MediaSkipped { get; set; }
    }

    public class ImportIssueDb
    {
        [BsonElement("code")]
        public string Code { get; set; }

        [BsonElement("message")]
        public string Message { get; set; }

        [BsonElement("path")]
        public string Path { get; set; }
    }
}
