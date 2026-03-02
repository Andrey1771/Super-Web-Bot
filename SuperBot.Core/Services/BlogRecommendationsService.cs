using Microsoft.Extensions.Logging;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using System.Linq;

namespace SuperBot.Core.Services
{
    public class BlogRecommendationsService : IBlogRecommendationsService
    {
        private const int HistoryLimit = 50;
        private const int LastShownLimit = 50;
        private static readonly string[] WeightedReadEvents = { "POST_READ_PROGRESS", "POST_READ_COMPLETE" };

        private readonly IBlogRepository _blogRepository;
        private readonly IBlogHomepageSettingsRepository _blogHomepageSettingsRepository;
        private readonly IBlogEventRepository _eventRepository;
        private readonly IUserBlogProfileRepository _profileRepository;
        private readonly ILogger<BlogRecommendationsService> _logger;

        public BlogRecommendationsService(
            IBlogRepository blogRepository,
            IBlogHomepageSettingsRepository blogHomepageSettingsRepository,
            IBlogEventRepository eventRepository,
            IUserBlogProfileRepository profileRepository,
            ILogger<BlogRecommendationsService> logger)
        {
            _blogRepository = blogRepository;
            _blogHomepageSettingsRepository = blogHomepageSettingsRepository;
            _eventRepository = eventRepository;
            _profileRepository = profileRepository;
            _logger = logger;
        }

        public async Task TrackEventAsync(BlogEvent blogEvent)
        {
            if (blogEvent == null)
            {
                return;
            }

            if (blogEvent.Timestamp == default)
            {
                blogEvent.Timestamp = DateTime.UtcNow;
            }

            await _eventRepository.CreateAsync(blogEvent);

            var identityUserId = string.IsNullOrWhiteSpace(blogEvent.UserId) ? null : blogEvent.UserId;
            var identityAnonId = string.IsNullOrWhiteSpace(blogEvent.AnonId) ? null : blogEvent.AnonId;

            UserBlogProfile profile = null;
            if (!string.IsNullOrWhiteSpace(identityUserId))
            {
                if (!string.IsNullOrWhiteSpace(identityAnonId))
                {
                    profile = await _profileRepository.MergeAnonIntoUserAsync(identityAnonId, identityUserId);
                }

                profile ??= await _profileRepository.GetByUserIdAsync(identityUserId);
            }
            else if (!string.IsNullOrWhiteSpace(identityAnonId))
            {
                profile = await _profileRepository.GetByAnonIdAsync(identityAnonId);
            }

            if (profile == null)
            {
                profile = new UserBlogProfile
                {
                    UserId = identityUserId,
                    AnonId = identityAnonId,
                    UpdatedAt = DateTime.UtcNow
                };
            }

            ApplyDecay(profile, blogEvent.Timestamp);

            var post = await _blogRepository.GetByIdAsync(blogEvent.PostId);
            if (post == null)
            {
                profile.UpdatedAt = DateTime.UtcNow;
                await _profileRepository.UpsertAsync(profile);
                return;
            }

            UpdateWeights(profile, post, blogEvent);
            UpdateHistory(profile, blogEvent);

            profile.UpdatedAt = DateTime.UtcNow;
            await _profileRepository.UpsertAsync(profile);
        }

        public async Task<BlogRecommendationsResult> GetHomeRecommendationsAsync(string userId, string anonId, int limit)
        {
            var normalizedLimit = Math.Clamp(limit, 3, 12);
            var profile = await ResolveProfileAsync(userId, anonId);

            var latestPosts = await _blogRepository.GetPublishedAsync(Math.Max(normalizedLimit, 6));
            var editorsPicks = await _blogRepository.GetEditorsPicksAsync(Math.Max(4, normalizedLimit));
            var homepageSettings = await _blogHomepageSettingsRepository.GetAsync();
            BlogPost configuredHeroPost = null;

            if (!string.IsNullOrWhiteSpace(homepageSettings?.MainHeroPostId))
            {
                var configuredCandidate = await _blogRepository.GetByIdAsync(homepageSettings.MainHeroPostId);
                if (configuredCandidate != null && string.Equals(configuredCandidate.Status, "PUBLISHED", StringComparison.OrdinalIgnoreCase))
                {
                    configuredHeroPost = configuredCandidate;
                }
            }

            configuredHeroPost ??= await _blogRepository.GetBlogHomeFeaturedAsync();

            var fallbackHeroPost = latestPosts.FirstOrDefault(post => !string.IsNullOrWhiteSpace(post.CoverUrl))
                                   ?? latestPosts.FirstOrDefault()
                                   ?? editorsPicks.FirstOrDefault();

            var heroPost = configuredHeroPost ?? fallbackHeroPost;
            if (heroPost == null)
            {
                return new BlogRecommendationsResult();
            }

            var popularThisWeek = await BuildPopularPostsAsync(normalizedLimit);

            var forYou = BuildForYou(profile, latestPosts, popularThisWeek, normalizedLimit);

            if (profile != null && forYou.Count > 0)
            {
                var now = DateTime.UtcNow;
                var shown = forYou.Select(post => new BlogShownItem
                {
                    PostId = post.Id,
                    Timestamp = now
                });

                profile.LastShown = shown.Concat(profile.LastShown)
                    .GroupBy(item => item.PostId)
                    .Select(group => group.OrderByDescending(item => item.Timestamp).First())
                    .OrderByDescending(item => item.Timestamp)
                    .Take(LastShownLimit)
                    .ToList();
                profile.UpdatedAt = now;
                await _profileRepository.UpsertAsync(profile);
            }

            return new BlogRecommendationsResult
            {
                HeroPost = heroPost,
                LatestPosts = latestPosts.Where(post => post.Id != heroPost.Id).Take(normalizedLimit).ToList(),
                PopularThisWeek = popularThisWeek.Where(post => post.Id != heroPost.Id).Take(normalizedLimit).ToList(),
                EditorsPicks = editorsPicks.Where(post => post.Id != heroPost.Id).Take(normalizedLimit).ToList(),
                ForYou = forYou.Where(post => post.Id != heroPost.Id).Take(normalizedLimit).ToList()
            };
        }

        public async Task<IReadOnlyList<BlogPost>> GetReadingHistoryAsync(string userId, int limit)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Array.Empty<BlogPost>();
            }

            var profile = await _profileRepository.GetByUserIdAsync(userId);
            if (profile == null || profile.ReadingHistory.Count == 0)
            {
                return Array.Empty<BlogPost>();
            }

            var ids = profile.ReadingHistory
                .OrderByDescending(item => item.Timestamp)
                .Select(item => item.PostId)
                .Distinct()
                .Take(Math.Clamp(limit, 1, 50))
                .ToList();

            return await _blogRepository.GetByIdsAsync(ids);
        }

        private async Task<UserBlogProfile> ResolveProfileAsync(string userId, string anonId)
        {
            if (!string.IsNullOrWhiteSpace(userId))
            {
                if (!string.IsNullOrWhiteSpace(anonId))
                {
                    var merged = await _profileRepository.MergeAnonIntoUserAsync(anonId, userId);
                    if (merged != null)
                    {
                        return merged;
                    }
                }

                return await _profileRepository.GetByUserIdAsync(userId);
            }

            if (!string.IsNullOrWhiteSpace(anonId))
            {
                return await _profileRepository.GetByAnonIdAsync(anonId);
            }

            return null;
        }

        private async Task<IReadOnlyList<BlogPost>> BuildPopularPostsAsync(int limit)
        {
            var fromUtc = DateTime.UtcNow.AddDays(-7);
            var events = await _eventRepository.GetRecentSinceAsync(fromUtc);
            if (events.Count == 0)
            {
                return await _blogRepository.GetPublishedAsync(limit);
            }

            var weights = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
            foreach (var blogEvent in events)
            {
                if (string.IsNullOrWhiteSpace(blogEvent.PostId))
                {
                    continue;
                }

                var score = blogEvent.EventType switch
                {
                    "POST_READ_COMPLETE" => 3.0,
                    "POST_BOOKMARK" => 2.5,
                    "POST_LIKE" => 2.5,
                    "POST_OPEN" => 1.0,
                    "POST_READ_PROGRESS" => 0.5,
                    _ => 0.2
                };

                if (!weights.ContainsKey(blogEvent.PostId))
                {
                    weights[blogEvent.PostId] = 0;
                }
                weights[blogEvent.PostId] += score;
            }

            var topIds = weights
                .OrderByDescending(pair => pair.Value)
                .Take(Math.Clamp(limit * 3, 10, 60))
                .Select(pair => pair.Key)
                .ToList();

            var posts = await _blogRepository.GetByIdsAsync(topIds);

            return posts
                .OrderByDescending(post => weights.TryGetValue(post.Id, out var score) ? score : 0)
                .ThenByDescending(post => post.PublishedAt)
                .Take(limit)
                .ToList();
        }

        private List<BlogPost> BuildForYou(UserBlogProfile profile, IReadOnlyList<BlogPost> latestPosts, IReadOnlyList<BlogPost> popularPosts, int limit)
        {
            if (profile == null || (profile.TagWeights.Count == 0 && profile.TopicWeights.Count == 0))
            {
                return popularPosts.Any() ? popularPosts.ToList() : latestPosts.ToList();
            }

            var now = DateTime.UtcNow;
            var seenIds = profile.ReadingHistory
                .Where(item => item.Progress >= 0.8)
                .Select(item => item.PostId)
                .ToHashSet();

            var recentlyShown = profile.LastShown
                .Where(item => (now - item.Timestamp).TotalDays <= 7)
                .Select(item => item.PostId)
                .ToHashSet();

            var candidates = latestPosts.Concat(popularPosts)
                .GroupBy(post => post.Id)
                .Select(group => group.First())
                .Where(post => post != null && !seenIds.Contains(post.Id) && !recentlyShown.Contains(post.Id))
                .ToList();

            var popularityWeights = popularPosts
                .Select((post, index) => new { post.Id, Weight = (popularPosts.Count - index) * 0.2 })
                .ToDictionary(item => item.Id, item => item.Weight);

            var scored = candidates
                .Select(post => new
                {
                    Post = post,
                    Score = ScorePost(profile, post, popularityWeights)
                })
                .OrderByDescending(item => item.Score)
                .ThenByDescending(item => item.Post.PublishedAt)
                .ToList();

            return DiversifyByTag(scored.Select(item => item.Post).ToList(), limit);
        }

        private double ScorePost(UserBlogProfile profile, BlogPost post, IReadOnlyDictionary<string, double> popularityWeights)
        {
            var score = 0.0;

            foreach (var tag in post.Tags ?? Array.Empty<string>())
            {
                if (profile.TagWeights.TryGetValue(tag, out var weight))
                {
                    score += weight;
                }
            }

            foreach (var topic in post.Topics ?? Array.Empty<string>())
            {
                if (profile.TopicWeights.TryGetValue(topic, out var weight))
                {
                    score += weight * 0.7;
                }
            }

            if (post.PublishedAt.HasValue)
            {
                var days = Math.Max((DateTime.UtcNow - post.PublishedAt.Value).TotalDays, 0);
                var recencyBoost = Math.Clamp(1 - (days / 30d), 0, 1) * 0.8;
                score += recencyBoost;
            }

            if (post.EditorScore.HasValue)
            {
                score += Math.Clamp(post.EditorScore.Value / 100d, 0, 1) * 0.6;
            }

            if (post.Featured)
            {
                score += 0.5;
            }

            if (popularityWeights.TryGetValue(post.Id, out var popularWeight))
            {
                score += popularWeight;
            }

            return score;
        }

        private List<BlogPost> DiversifyByTag(List<BlogPost> posts, int limit)
        {
            var result = new List<BlogPost>();
            var tagCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            foreach (var post in posts)
            {
                var primaryTag = post.Tags?.FirstOrDefault() ?? string.Empty;
                if (primaryTag != string.Empty)
                {
                    tagCounts.TryGetValue(primaryTag, out var count);
                    if (count >= 2)
                    {
                        continue;
                    }
                }

                result.Add(post);
                if (primaryTag != string.Empty)
                {
                    tagCounts[primaryTag] = tagCounts.GetValueOrDefault(primaryTag) + 1;
                }

                if (result.Count >= limit)
                {
                    break;
                }
            }

            if (result.Count < limit)
            {
                foreach (var post in posts)
                {
                    if (result.Any(item => item.Id == post.Id))
                    {
                        continue;
                    }

                    result.Add(post);
                    if (result.Count >= limit)
                    {
                        break;
                    }
                }
            }

            return result;
        }

        private void UpdateWeights(UserBlogProfile profile, BlogPost post, BlogEvent blogEvent)
        {
            var tags = post.Tags ?? Array.Empty<string>();
            var topics = post.Topics ?? Array.Empty<string>();

            void AddWeight(Dictionary<string, double> weights, string key, double amount)
            {
                if (string.IsNullOrWhiteSpace(key))
                {
                    return;
                }

                if (!weights.ContainsKey(key))
                {
                    weights[key] = 0;
                }

                weights[key] += amount;
            }

            switch (blogEvent.EventType)
            {
                case "POST_OPEN":
                    foreach (var tag in tags)
                    {
                        AddWeight(profile.TagWeights, tag, 1.0);
                    }
                    foreach (var topic in topics)
                    {
                        AddWeight(profile.TopicWeights, topic, 0.7);
                    }
                    break;
                case "POST_READ_PROGRESS":
                    if (blogEvent.ScrollDepth >= 0.3 && blogEvent.DwellMs > 0)
                    {
                        foreach (var tag in tags)
                        {
                            AddWeight(profile.TagWeights, tag, 0.1);
                        }
                    }
                    break;
                case "POST_READ_COMPLETE":
                    foreach (var tag in tags)
                    {
                        AddWeight(profile.TagWeights, tag, 2.0);
                    }
                    foreach (var topic in topics)
                    {
                        AddWeight(profile.TopicWeights, topic, 1.5);
                    }
                    break;
                case "POST_BOOKMARK":
                case "POST_LIKE":
                    foreach (var tag in tags)
                    {
                        AddWeight(profile.TagWeights, tag, 2.5);
                    }
                    break;
                case "POST_IMPRESSION":
                    foreach (var tag in tags)
                    {
                        AddWeight(profile.TagWeights, tag, 0.2);
                    }
                    break;
            }
        }

        private void UpdateHistory(UserBlogProfile profile, BlogEvent blogEvent)
        {
            if (blogEvent.EventType == "POST_IMPRESSION")
            {
                profile.LastShown = new[] { new BlogShownItem { PostId = blogEvent.PostId, Timestamp = blogEvent.Timestamp } }
                    .Concat(profile.LastShown)
                    .GroupBy(item => item.PostId)
                    .Select(group => group.OrderByDescending(item => item.Timestamp).First())
                    .OrderByDescending(item => item.Timestamp)
                    .Take(LastShownLimit)
                    .ToList();
                return;
            }

            if (WeightedReadEvents.Contains(blogEvent.EventType))
            {
                var historyItem = new BlogReadingHistoryItem
                {
                    PostId = blogEvent.PostId,
                    Timestamp = blogEvent.Timestamp,
                    Progress = blogEvent.ScrollDepth ?? 0,
                    DwellMs = blogEvent.DwellMs ?? 0
                };

                profile.ReadingHistory = new[] { historyItem }
                    .Concat(profile.ReadingHistory)
                    .OrderByDescending(item => item.Timestamp)
                    .Take(HistoryLimit)
                    .ToList();
            }
        }

        private void ApplyDecay(UserBlogProfile profile, DateTime now)
        {
            if (profile == null)
            {
                return;
            }

            if (profile.UpdatedAt == default)
            {
                profile.UpdatedAt = now;
                return;
            }

            var days = Math.Max((now - profile.UpdatedAt).TotalDays, 0);
            if (days <= 0)
            {
                return;
            }

            var decay = Math.Pow(0.995, days);
            ApplyDecay(profile.TagWeights, decay);
            ApplyDecay(profile.TopicWeights, decay);
        }

        private static void ApplyDecay(Dictionary<string, double> weights, double decay)
        {
            var keys = weights.Keys.ToList();
            foreach (var key in keys)
            {
                weights[key] = weights[key] * decay;
            }
        }
    }
}
