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
const EDITORIAL_FETCH_LIMIT = 9;
const sortOptions = ["Newest", "Most popular", "Editor's picks"] as const;

const formatSort = (value: typeof sortOptions[number]) => value;

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
    const priorityRank = new Map<string, number>();
    priorityIds.forEach((id, index) => priorityRank.set(id, index));

    return [...posts].sort((a, b) => {
        const rankA = priorityRank.get(a.id);
        const rankB = priorityRank.get(b.id);

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
    const [sort, setSort] = useState<typeof sortOptions[number]>(sortOptions[0]);
    const [recommendations, setRecommendations] = useState<BlogRecommendationsResponse | null>(null);
    const [supplementalPosts, setSupplementalPosts] = useState<BlogListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const debouncedSearch = useDebouncedValue(searchInput, 320);

    useEffect(() => {
        const fetchRecommendations = async () => {
            try {
                setLoading(true);
                setError(null);

                const [recommendationResponse, featuredResponse] = await Promise.all([
                    blogService.getHomeRecommendations({
                        anonId: getAnonId(),
                        limit: RECOMMENDATION_LIMIT
                    }),
                    blogService.getPosts({page: 1, pageSize: EDITORIAL_FETCH_LIMIT, featured: true})
                ]);

                let fallbackPool = featuredResponse.items;
                if (fallbackPool.length === 0) {
                    const fallbackResponse = await blogService.getPosts({page: 1, pageSize: EDITORIAL_FETCH_LIMIT});
                    fallbackPool = fallbackResponse.items;
                }

                setRecommendations(recommendationResponse);
                setSupplementalPosts(fallbackPool);
            } catch (fetchError) {
                console.error(fetchError);
                setError("Unable to load blog posts.");
                setRecommendations(null);
                setSupplementalPosts([]);
            } finally {
                setLoading(false);
            }
        };

        fetchRecommendations();
    }, [blogService]);

    const heroPost = useMemo(() => {
        if (recommendations?.heroPost) {
            return recommendations.heroPost;
        }

        const fallback = buildUniquePosts(
            recommendations?.latestPosts,
            recommendations?.editorsPicks,
            recommendations?.popularThisWeek,
            recommendations?.forYou,
            supplementalPosts
        );

        return fallback[0] ?? null;
    }, [recommendations, supplementalPosts]);

    const editorialStack = useMemo(() => {
        const picks = buildUniquePosts(
            recommendations?.editorsPicks,
            supplementalPosts,
            recommendations?.popularThisWeek,
            recommendations?.forYou,
            recommendations?.latestPosts
        );

        return picks
            .filter((post) => post.id !== heroPost?.id)
            .slice(0, 3);
    }, [heroPost?.id, recommendations, supplementalPosts]);

    const allSourcePosts = useMemo(() => {
        return buildUniquePosts(
            heroPost ? [heroPost] : undefined,
            recommendations?.latestPosts,
            recommendations?.popularThisWeek,
            recommendations?.forYou,
            recommendations?.editorsPicks,
            supplementalPosts
        );
    }, [heroPost, recommendations, supplementalPosts]);

    const tagFilters = useMemo(() => {
        const tagSet = new Set<string>();

        allSourcePosts.forEach((post) => {
            post.tags.forEach((tag) => tagSet.add(tag));
        });

        const orderedTags = Array.from(tagSet)
            .sort((a, b) => a.localeCompare(b))
            .slice(0, 7);

        return ["All", ...orderedTags];
    }, [allSourcePosts]);

    const matchesFilters = useMemo(() => {
        const normalizedSearch = debouncedSearch.trim().toLowerCase();
        const normalizedActiveTag = normalizeTag(activeTag);

        return (post: BlogListItem) => {
            const matchesTag =
                normalizedActiveTag === "all" ||
                post.tags.some((tag) => normalizeTag(tag) === normalizedActiveTag);

            if (!normalizedSearch) {
                return matchesTag;
            }

            const text = `${post.title} ${post.excerpt} ${post.tags.join(" ")}`.toLowerCase();
            return matchesTag && text.includes(normalizedSearch);
        };
    }, [activeTag, debouncedSearch]);

    const filteredSourcePosts = useMemo(() => {
        return allSourcePosts.filter(matchesFilters);
    }, [allSourcePosts, matchesFilters]);

    const popularPriorityIds = useMemo(
        () => buildPriorityIds(recommendations?.popularThisWeek, recommendations?.forYou),
        [recommendations?.forYou, recommendations?.popularThisWeek]
    );

    const editorialPriorityIds = useMemo(
        () => buildPriorityIds(heroPost ? [heroPost] : undefined, recommendations?.editorsPicks, supplementalPosts),
        [heroPost, recommendations?.editorsPicks, supplementalPosts]
    );

    const sortedFeedSource = useMemo(() => {
        if (sort === "Most popular") {
            return sortWithPriority(filteredSourcePosts, popularPriorityIds);
        }

        if (sort === "Editor's picks") {
            return sortWithPriority(filteredSourcePosts, editorialPriorityIds);
        }

        return [...filteredSourcePosts].sort(byPublishedAtDesc);
    }, [editorialPriorityIds, filteredSourcePosts, popularPriorityIds, sort]);

    const excludedIds = useMemo(() => {
        const ids = new Set<string>();
        if (heroPost) {
            ids.add(heroPost.id);
        }

        editorialStack.forEach((post) => ids.add(post.id));
        return ids;
    }, [editorialStack, heroPost]);

    const feedPosts = useMemo(() => {
        return sortedFeedSource.filter((post) => !excludedIds.has(post.id));
    }, [excludedIds, sortedFeedSource]);

    const isFiltering = Boolean(debouncedSearch.trim()) || activeTag !== "All";
    const resultsCount = sortedFeedSource.length;

    const handleClearFilters = () => {
        setSearchInput("");
        setActiveTag("All");
    };

    const toolbarSkeleton = (
        <div className="blog-toolbar blog-toolbar--skeleton">
            <div className="skeleton h-12" />
        </div>
    );

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
                    ) : error ? (
                        <div className="featured-card featured-card--fallback">
                            <div className="featured-content">
                                <h2>Unable to load blog posts</h2>
                                <p className="featured-text">{error}</p>
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
                            <aside className="featured-editors-inline surface" aria-label="Top picks">
                                <div className="featured-editors-inline__header">
                                    <span className="eyebrow eyebrow--inline">Editor picks</span>
                                    <Link className="link-primary" to="/blog">
                                        View all
                                        <FontAwesomeIcon icon={faArrowRightLong} />
                                    </Link>
                                </div>
                                {editorialStack.length > 0 ? (
                                    <div className="featured-editors-inline__list">
                                        {editorialStack.map((post) => (
                                            <PostCard key={post.id} post={post} variant="mini" />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="muted">More curated picks will appear here as new posts are published.</p>
                                )}
                            </aside>
                        </div>
                    ) : (
                        <div className="featured-card featured-card--fallback">
                            <div className="featured-content">
                                <h2>No posts yet</h2>
                                <p className="featured-text">Once posts are published, the first highlight will appear here.</p>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <section className="blog-toolbar-section section" aria-label="Blog filters">
                <div className="container">
                    {loading ? toolbarSkeleton : (
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
                                {tagFilters.map((filter) => (
                                    <button
                                        key={filter}
                                        className={`chip ${filter === activeTag ? "chip-active" : ""}`}
                                        onClick={() => setActiveTag(filter)}
                                        type="button"
                                        role="listitem"
                                    >
                                        {filter}
                                    </button>
                                ))}
                            </div>
                            <div className="blog-toolbar__sort-row">
                                <label className="sort-select">
                                    <span className="visually-hidden">Sort posts</span>
                                    <select value={sort} onChange={(event) => setSort(event.target.value as typeof sortOptions[number])}>
                                        {sortOptions.map((option) => (
                                            <option key={option} value={option}>{formatSort(option)}</option>
                                        ))}
                                    </select>
                                </label>
                                {isFiltering ? (
                                    <button className="btn btn-outline" type="button" onClick={handleClearFilters}>Clear filters</button>
                                ) : null}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <section className="blog-feed section">
                <div className="container">
                    {isFiltering ? (
                        <div className="feed-summary surface">
                            <div className="feed-summary__text">
                                <FontAwesomeIcon icon={faSparkles} />
                                <span>
                                    Found {resultsCount} posts
                                    {debouncedSearch.trim() ? ` for “${debouncedSearch.trim()}”` : ""}
                                    {activeTag !== "All" ? ` in ${activeTag}` : ""}
                                </span>
                            </div>
                            <button className="btn btn-link" type="button" onClick={handleClearFilters}>Clear filters</button>
                        </div>
                    ) : null}

                    {loading ? (
                        <div className="posts-grid blog-feed-grid">
                            {Array.from({length: 8}).map((_, index) => (
                                <div className="post-card post-card--compact" key={`feed-skeleton-${index}`}>
                                    <div className="post-card__media post-card__media--compact"><div className="skeleton h-32" /></div>
                                    <div className="post-card__body post-card__body--compact"><div className="skeleton h-6" /><div className="skeleton h-4 mt-3" /></div>
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <div className="results-empty surface">
                            <p className="muted">{error}</p>
                        </div>
                    ) : feedPosts.length === 0 ? (
                        <div className="results-empty surface">
                            <h3>No posts found</h3>
                            <p className="muted">Try changing search text or selecting another topic.</p>
                            {isFiltering ? (
                                <button className="btn btn-outline" type="button" onClick={handleClearFilters}>Clear filters</button>
                            ) : null}
                        </div>
                    ) : (
                        <div className="posts-grid blog-feed-grid">
                            {feedPosts.map((post) => (
                                <PostCard post={post} key={post.id} variant="compact" />
                            ))}
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
