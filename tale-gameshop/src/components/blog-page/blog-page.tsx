import React, {useEffect, useMemo, useState} from "react";
import useDebouncedValue from "../../hooks/useDebouncedValue";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faArrowRightLong,
    faMagnifyingGlass,
    faSparkles,
    faXmark
} from "@fortawesome/free-solid-svg-icons";
import {Link} from "react-router-dom";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type {IBlogService} from "../../iterfaces/i-blog-service";
import type {BlogListItem, BlogRecommendationsResponse} from "../../types/blog";
import PostCard from "../../pages/blog/components/PostCard";
import {getAnonId} from "../../hooks/use-blog-tracking";
import "./blog-page.css";

const RECOMMENDATION_LIMIT = 6;
const FEATURED_FETCH_LIMIT = 9;
const MAIN_FEED_FETCH_LIMIT = 24;
const sortOptions = ["Newest", "Most popular", "Editor's picks"] as const;

type SortOption = typeof sortOptions[number];

const byPublishedAtDesc = (a: BlogListItem, b: BlogListItem) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return dateB - dateA;
};

const normalizeTag = (tag: string) => tag.trim().toLowerCase();

const buildUniquePosts = (...groups: Array<BlogListItem[] | undefined>) => {
    const postMap = new Map<string, BlogListItem>();
    groups.forEach((group) => {
        group?.forEach((post) => {
            if (!postMap.has(post.id)) {
                postMap.set(post.id, post);
            }
        });
    });
    return Array.from(postMap.values());
};

const buildPriorityIds = (...groups: Array<BlogListItem[] | undefined>) => {
    const seen = new Set<string>();
    const ids: string[] = [];

    groups.forEach((group) => {
        group?.forEach((post) => {
            if (!seen.has(post.id)) {
                seen.add(post.id);
                ids.push(post.id);
            }
        });
    });

    return ids;
};

const sortWithPriority = (posts: BlogListItem[], priorityIds: string[]) => {
    if (priorityIds.length === 0) {
        return [...posts].sort(byPublishedAtDesc);
    }

    const rank = new Map<string, number>();
    priorityIds.forEach((id, index) => rank.set(id, index));

    return [...posts].sort((a, b) => {
        const rankA = rank.get(a.id);
        const rankB = rank.get(b.id);

        if (rankA !== undefined && rankB !== undefined) {
            return rankA - rankB;
        }

        if (rankA !== undefined) {
            return -1;
        }

        if (rankB !== undefined) {
            return 1;
        }

        return byPublishedAtDesc(a, b);
    });
};

export default function BlogPage() {
    const blogService = container.get<IBlogService>(IDENTIFIERS.IBlogService);

    const [activeTag, setActiveTag] = useState("All");
    const [searchInput, setSearchInput] = useState("");
    const [sort, setSort] = useState<SortOption>("Newest");
    const [recommendations, setRecommendations] = useState<BlogRecommendationsResponse | null>(null);
    const [featuredPool, setFeaturedPool] = useState<BlogListItem[]>([]);
    const [fallbackPosts, setFallbackPosts] = useState<BlogListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const debouncedSearch = useDebouncedValue(searchInput, 320);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            const [recommendationsResult, featuredResult, fallbackResult] = await Promise.allSettled([
                blogService.getHomeRecommendations({anonId: getAnonId(), limit: RECOMMENDATION_LIMIT}),
                blogService.getPosts({page: 1, pageSize: FEATURED_FETCH_LIMIT, featured: true}),
                blogService.getPosts({page: 1, pageSize: MAIN_FEED_FETCH_LIMIT})
            ]);

            const nextRecommendations = recommendationsResult.status === "fulfilled"
                ? recommendationsResult.value
                : null;

            const featuredItems = featuredResult.status === "fulfilled"
                ? featuredResult.value.items
                : [];

            const fallbackItems = fallbackResult.status === "fulfilled"
                ? fallbackResult.value.items
                : [];

            setRecommendations(nextRecommendations);
            setFeaturedPool(buildUniquePosts(featuredItems, fallbackItems));
            setFallbackPosts(fallbackItems);

            if (!nextRecommendations && fallbackItems.length === 0) {
                setError("Unable to load blog posts.");
            }

            setLoading(false);
        };

        void loadData();
    }, [blogService]);

    const heroPost = useMemo(() => {
        if (recommendations?.heroPost) {
            return recommendations.heroPost;
        }

        return buildUniquePosts(
            recommendations?.latestPosts,
            recommendations?.editorsPicks,
            recommendations?.popularThisWeek,
            featuredPool,
            fallbackPosts
        )[0] ?? null;
    }, [fallbackPosts, featuredPool, recommendations]);

    const editorPicksRail = useMemo(() => {
        return buildUniquePosts(
            recommendations?.editorsPicks,
            featuredPool,
            recommendations?.popularThisWeek,
            recommendations?.forYou,
            fallbackPosts
        )
            .filter((post) => post.id !== heroPost?.id)
            .slice(0, 3);
    }, [fallbackPosts, featuredPool, heroPost?.id, recommendations]);

    const allKnownPosts = useMemo(() => {
        return buildUniquePosts(
            heroPost ? [heroPost] : undefined,
            fallbackPosts,
            recommendations?.latestPosts,
            recommendations?.popularThisWeek,
            recommendations?.forYou,
            recommendations?.editorsPicks,
            featuredPool
        );
    }, [fallbackPosts, featuredPool, heroPost, recommendations]);

    const mainFeedSource = useMemo(() => {
        if (fallbackPosts.length > 0) {
            return fallbackPosts;
        }

        return buildUniquePosts(
            recommendations?.latestPosts,
            recommendations?.popularThisWeek,
            recommendations?.forYou,
            recommendations?.editorsPicks,
            featuredPool,
            heroPost ? [heroPost] : undefined
        );
    }, [fallbackPosts, featuredPool, heroPost, recommendations]);

    const tagFilters = useMemo(() => {
        const tags = new Set<string>();

        allKnownPosts.forEach((post) => {
            post.tags.forEach((tag) => tags.add(tag));
        });

        return ["All", ...Array.from(tags).sort((a, b) => a.localeCompare(b)).slice(0, 8)];
    }, [allKnownPosts]);

    const matchesFilters = useMemo(() => {
        const normalizedSearch = debouncedSearch.trim().toLowerCase();
        const normalizedActiveTag = normalizeTag(activeTag);

        return (post: BlogListItem) => {
            const matchesTag = normalizedActiveTag === "all" || post.tags.some((tag) => normalizeTag(tag) === normalizedActiveTag);
            if (!matchesTag) {
                return false;
            }

            if (!normalizedSearch) {
                return true;
            }

            const searchText = `${post.title} ${post.excerpt} ${post.tags.join(" ")}`.toLowerCase();
            return searchText.includes(normalizedSearch);
        };
    }, [activeTag, debouncedSearch]);

    const filteredMainSource = useMemo(() => mainFeedSource.filter(matchesFilters), [mainFeedSource, matchesFilters]);

    const popularPriority = useMemo(
        () => buildPriorityIds(recommendations?.popularThisWeek, recommendations?.forYou),
        [recommendations?.forYou, recommendations?.popularThisWeek]
    );

    const editorPriority = useMemo(
        () => buildPriorityIds(heroPost ? [heroPost] : undefined, recommendations?.editorsPicks, featuredPool),
        [featuredPool, heroPost, recommendations?.editorsPicks]
    );

    const sortedMainPosts = useMemo(() => {
        if (sort === "Most popular") {
            return sortWithPriority(filteredMainSource, popularPriority);
        }

        if (sort === "Editor's picks") {
            return sortWithPriority(filteredMainSource, editorPriority);
        }

        return [...filteredMainSource].sort(byPublishedAtDesc);
    }, [editorPriority, filteredMainSource, popularPriority, sort]);

    const isFiltering = Boolean(debouncedSearch.trim()) || activeTag !== "All";

    const feedPosts = useMemo(() => {
        if (isFiltering) {
            return sortedMainPosts;
        }

        if (sortedMainPosts.length <= 6) {
            return sortedMainPosts;
        }

        const exclusionIds = new Set<string>();
        if (heroPost) {
            exclusionIds.add(heroPost.id);
        }
        editorPicksRail.forEach((post) => exclusionIds.add(post.id));

        const withoutTopPosts = sortedMainPosts.filter((post) => !exclusionIds.has(post.id));
        return withoutTopPosts.length >= 4 ? withoutTopPosts : sortedMainPosts;
    }, [editorPicksRail, heroPost, isFiltering, sortedMainPosts]);

    const handleClearFilters = () => {
        setSearchInput("");
        setActiveTag("All");
    };

    return (
        <main className="blog-page blog-page--editorial">
            <section className="blog-hero section">
                <div className="container blog-hero__inner blog-hero__inner--simple">
                    <div className="blog-hero__copy">
                        <div className="eyebrow">TALE SHOP BLOG</div>
                        <h1>News, guides &amp; weekly picks</h1>
                        <p className="hero-subtitle">Curated gaming news, practical guides, and weekly deals picked by the Tale team to keep you ahead of every drop.</p>
                    </div>
                </div>
            </section>

            <section className="blog-featured section">
                <div className="container">
                    {loading ? (
                        <div className="featured-skeleton-grid">
                            <div className="skeleton h-80" />
                            <div className="featured-stack-skeleton">
                                <div className="skeleton h-28" />
                                <div className="skeleton h-28" />
                                <div className="skeleton h-28" />
                            </div>
                        </div>
                    ) : heroPost ? (
                        <div className="blog-featured-layout">
                            <PostCard
                                post={heroPost}
                                variant="featured"
                                showFeaturedBadge
                                showActions
                                onTagSelect={(tag) => setActiveTag(tag || "All")}
                            />
                            <aside className="featured-editors-inline surface" aria-label="Editor picks">
                                <div className="featured-editors-inline__header">
                                    <span className="eyebrow eyebrow--inline">Editor picks</span>
                                    <Link className="link-primary" to="/blog">
                                        View all
                                        <FontAwesomeIcon icon={faArrowRightLong} />
                                    </Link>
                                </div>
                                {editorPicksRail.length > 0 ? (
                                    <div className="featured-editors-inline__list">
                                        {editorPicksRail.map((post) => (
                                            <PostCard key={post.id} post={post} variant="mini" />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="muted">New editorial picks will appear here soon.</p>
                                )}
                            </aside>
                        </div>
                    ) : (
                        <div className="featured-card featured-card--fallback">
                            <div className="featured-content">
                                <h2>Blog is preparing fresh content</h2>
                                <p className="featured-text">{error ?? "Posts will appear here as soon as they are published."}</p>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <section className="blog-toolbar-section section" aria-label="Blog filters">
                <div className="container">
                    <div className="blog-toolbar">
                        <label className="search-field blog-toolbar__search" aria-label="Search articles">
                            <FontAwesomeIcon icon={faMagnifyingGlass} />
                            <input
                                type="search"
                                placeholder="Search articles…"
                                value={searchInput}
                                onChange={(event) => setSearchInput(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                        handleClearFilters();
                                    }
                                }}
                            />
                            {searchInput.trim() ? (
                                <button className="icon-button search-clear" type="button" onClick={handleClearFilters} aria-label="Clear search">
                                    <FontAwesomeIcon icon={faXmark} />
                                </button>
                            ) : null}
                        </label>
                        <div className="chip-row blog-toolbar__chips" role="list" aria-label="Filter by tag">
                            {tagFilters.map((tag) => (
                                <button
                                    key={tag}
                                    type="button"
                                    role="listitem"
                                    className={`chip ${tag === activeTag ? "chip-active" : ""}`}
                                    onClick={() => setActiveTag(tag)}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                        <div className="blog-toolbar__sort-row">
                            <label className="sort-select">
                                <span className="visually-hidden">Sort posts</span>
                                <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}>
                                    {sortOptions.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </div>
                </div>
            </section>

            <section className="blog-feed section">
                <div className="container">
                    {isFiltering ? (
                        <div className="feed-summary surface">
                            <div className="feed-summary__text">
                                <FontAwesomeIcon icon={faSparkles} />
                                <span>
                                    Found {feedPosts.length} posts
                                    {debouncedSearch.trim() ? ` for “${debouncedSearch.trim()}”` : ""}
                                    {activeTag !== "All" ? ` in ${activeTag}` : ""}
                                </span>
                            </div>
                            <button className="btn btn-link" type="button" onClick={handleClearFilters}>Clear filters</button>
                        </div>
                    ) : null}

                    {loading ? (
                        <div className="posts-grid blog-feed-grid">
                            {Array.from({length: 9}).map((_, index) => (
                                <div className="post-card post-card--compact" key={`feed-skeleton-${index}`}>
                                    <div className="post-card__media post-card__media--compact"><div className="skeleton h-32" /></div>
                                    <div className="post-card__body post-card__body--compact"><div className="skeleton h-6" /><div className="skeleton h-4 mt-3" /></div>
                                </div>
                            ))}
                        </div>
                    ) : feedPosts.length > 0 ? (
                        <div className="posts-grid blog-feed-grid">
                            {feedPosts.map((post) => (
                                <PostCard key={post.id} post={post} variant="compact" />
                            ))}
                        </div>
                    ) : isFiltering ? (
                        <div className="results-empty surface">
                            <h3>No posts found</h3>
                            <p className="muted">Try changing the search query or selecting a different tag.</p>
                            <button className="btn btn-outline" type="button" onClick={handleClearFilters}>Clear filters</button>
                        </div>
                    ) : (
                        <div className="results-empty surface">
                            <h3>No posts yet</h3>
                            <p className="muted">We are preparing the first blog articles.</p>
                        </div>
                    )}
                </div>
            </section>

            <section className="cta-strip section">
                <div className="container">
                    <div className="cta-card">
                        <div className="cta-copy">
                            <h2>Looking for this week’s best prices?</h2>
                            <p>One email per week. No spam. Unsubscribe anytime.</p>
                        </div>
                        <div className="cta-actions">
                            <button className="btn btn-primary" type="button">Go to Store</button>
                            <button className="btn btn-secondary" type="button">Browse deals</button>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
