namespace SuperBot.Core.Entities
{
    public class BlogRecommendationsResult
    {
        public BlogPost HeroPost { get; set; }
        public IReadOnlyList<BlogPost> LatestPosts { get; set; } = Array.Empty<BlogPost>();
        public IReadOnlyList<BlogPost> PopularThisWeek { get; set; } = Array.Empty<BlogPost>();
        public IReadOnlyList<BlogPost> EditorsPicks { get; set; } = Array.Empty<BlogPost>();
        public IReadOnlyList<BlogPost> ForYou { get; set; } = Array.Empty<BlogPost>();
    }
}
