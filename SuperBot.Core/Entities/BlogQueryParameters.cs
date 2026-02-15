namespace SuperBot.Core.Entities
{
    public class BlogQueryParameters
    {
        public string Search { get; set; }
        public string Status { get; set; }
        public string Tag { get; set; }
        public bool? Featured { get; set; }
        public bool? MainFeatured { get; set; }
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 12;
        public string Sort { get; set; } = "updatedAt:desc";
    }
}
