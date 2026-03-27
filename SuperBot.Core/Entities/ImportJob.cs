namespace SuperBot.Core.Entities
{
    public class ImportJob
    {
        public string Id { get; set; }
        public string UserId { get; set; }
        public string UserName { get; set; }
        public DateTime StartedAt { get; set; }
        public DateTime? FinishedAt { get; set; }
        public string Status { get; set; }
        public bool DryRun { get; set; }
        public ImportJobStats Stats { get; set; } = new();
        public List<ImportIssue> Errors { get; set; } = new();
        public List<ImportIssue> Warnings { get; set; } = new();
        public string[] Includes { get; set; } = Array.Empty<string>();
    }

    public class ImportJobStats
    {
        public int GamesCreated { get; set; }
        public int GamesUpdated { get; set; }
        public int GamesSkipped { get; set; }
        public int BlogCreated { get; set; }
        public int BlogUpdated { get; set; }
        public int BlogSkipped { get; set; }
        public int MediaCreated { get; set; }
        public int MediaSkipped { get; set; }
    }

    public class ImportIssue
    {
        public string Code { get; set; }
        public string Message { get; set; }
        public string Path { get; set; }
    }
}
