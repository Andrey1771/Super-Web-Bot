namespace SuperBot.Core.Entities
{
    public class MediaAsset
    {
        public string Id { get; set; }
        public string Url { get; set; }
        public string Filename { get; set; }
        public string ContentType { get; set; }
        public long SizeBytes { get; set; }
        public int? Width { get; set; }
        public int? Height { get; set; }
        public DateTime CreatedAt { get; set; }
        public string[] Tags { get; set; }
    }
}
