import React, {useEffect, useMemo, useState} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faArrowRightLong,
    faCompass,
    faGamepad,
    faMagnifyingGlass,
    faShieldHalved,
    faSparkles,
    faTags
} from "@fortawesome/free-solid-svg-icons";
import {Link} from "react-router-dom";
import useDebouncedValue from "../../hooks/useDebouncedValue";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type {IBlogService} from "../../iterfaces/i-blog-service";
import type {BlogListItem, BlogRecommendationsResponse} from "../../types/blog";
import PostCard from "../../pages/blog/components/PostCard";
import {getAnonId} from "../../hooks/use-blog-tracking";
import "./blog-page.css";

const RECOMMENDATION_LIMIT = 8;
const POSTS_PAGE_SIZE = 18;
const sortOptions = ["Newest", "Most popular", "Editor's picks"] as const;
const MIN_FEED_ITEMS = 9;

type SortOption = (typeof sortOptions)[number];

type LoadedData = {
    recommendations: BlogRecommendationsResponse | null;
    featuredPool: BlogListItem[];
    fallbackPosts: BlogListItem[];
};

const uniqById = (posts: BlogListItem[]): BlogListItem[] => {
    const seen = new Set<string>();
    const result: BlogListItem[] = [];
    posts.forEach((post) => {
        if (!seen.has(post.id)) {
            seen.add(post.id);
            result.push(post);
        }
    });
    return result;
};

const withSoftFallback = (base: BlogListItem[], fallback: BlogListItem[]): BlogListItem[] => {
    if (base.length >= MIN_FEED_ITEMS) {
        return base;
    }

    return [...base, ...fallback].slice(0, POSTS_PAGE_SIZE);
};

const toTime = (publishedAt?: string) => (publishedAt ? new Date(publishedAt).getTime() : 0);

const sortByNewest = (posts: BlogListItem[]) => [...posts].sort((a, b) => toTime(b.publishedAt) - toTime(a.publishedAt));

const sortPosts = (posts: BlogListItem[], sort: SortOption, popularIds: string[], editorIds: string[]): BlogListItem[] => {
    if (sort === "Newest") {
        return sortByNewest(posts);
    }

    if (sort === "Most popular") {
        const rankMap = new Map(popularIds.map((id, index) => [id, index]));
        return [...posts].sort((a, b) => {
            const rankA = rankMap.has(a.id) ? rankMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
            const rankB = rankMap.has(b.id) ? rankMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
            if (rankA !== rankB) {
                return rankA - rankB;
            }
            return toTime(b.publishedAt) - toTime(a.publishedAt);
        });
    }

    const rankMap = new Map(editorIds.map((id, index) => [id, index]));
    return [...posts].sort((a, b) => {
        const rankA = rankMap.has(a.id) ? rankMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
        const rankB = rankMap.has(b.id) ? rankMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) {
            return rankA - rankB;
        }
        return toTime(b.publishedAt) - toTime(a.publishedAt);
    });
};

const formatDate = (value?: string) => {
    if (!value) {
        return "Draft";
    }
    return new Date(value).toLocaleDateString();
};

const tagIcons: Record<string, typeof faSparkles> = {
    Deals: faTags,
    Guides: faCompass,
    Reviews: faGamepad,
    Security: faShieldHalved,
    Updates: faSparkles
};

const getTagIcon = (tag: string) => {
    return tagIcons[tag] ?? faSparkles;
};

export default function BlogPage() {
    const blogService = container.get<IBlogService>(IDENTIFIERS.IBlogService);
    const [activeTag, setActiveTag] = useState("All");
    const [searchInput, setSearchInput] = useState("");
    const [sort, setSort] = useState<SortOption>("Newest");
    const [data, setData] = useState<LoadedData>({
        recommendations: null,
        featuredPool: [],
        fallbackPosts: []
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [headerOffset, setHeaderOffset] = useState(88);
    const debouncedSearch = useDebouncedValue(searchInput, 320);

    useEffect(() => {
        const updateHeaderOffset = () => {
            const header = document.querySelector(".header-nav") as HTMLElement | null;
            const nextOffset = header?.offsetHeight ?? 72;
            setHeaderOffset(nextOffset + 10);
        };

        updateHeaderOffset();
        window.addEventListener("resize", updateHeaderOffset);
        return () => window.removeEventListener("resize", updateHeaderOffset);
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            const [recommendationsResult, featuredResult, fallbackResult] = await Promise.allSettled([
                blogService.getHomeRecommendations({anonId: getAnonId(), limit: RECOMMENDATION_LIMIT}),
                blogService.getPosts({page: 1, pageSize: 6, featured: true}),
                blogService.getPosts({page: 1, pageSize: POSTS_PAGE_SIZE})
            ]);

            const recommendations = recommendationsResult.status === "fulfilled" ? recommendationsResult.value : null;
            const featuredPool = featuredResult.status === "fulfilled" ? featuredResult.value.items : [];
            const fallbackPosts = fallbackResult.status === "fulfilled" ? fallbackResult.value.items : [];

            if (!recommendations && fallbackPosts.length === 0 && featuredPool.length === 0) {
                setError("Unable to load blog posts right now.");
            } else if (recommendationsResult.status === "rejected" || featuredResult.status === "rejected" || fallbackResult.status === "rejected") {
                setError("Some recommendations are unavailable, showing latest published posts.");
            }

            setData({recommendations, featuredPool, fallbackPosts});
            setLoading(false);
        };

        fetchData();
    }, [blogService]);

    const featuredPost = useMemo(() => {
        return data.recommendations?.heroPost
            ?? data.featuredPool[0]
            ?? data.recommendations?.editorsPicks[0]
            ?? data.recommendations?.latestPosts[0]
            ?? data.fallbackPosts[0];
    }, [data]);

    const compactEditorPicks = useMemo(() => {
        const picks = uniqById([
            ...(data.recommendations?.editorsPicks ?? []),
            ...data.featuredPool,
            ...(data.recommendations?.forYou ?? []),
            ...data.fallbackPosts
        ]);

        const withoutFeatured = featuredPost ? picks.filter((post) => post.id !== featuredPost.id) : picks;
        const finalPicks = withoutFeatured.length >= 3 ? withoutFeatured : picks;
        return finalPicks.slice(0, 3);
    }, [data, featuredPost]);

    const baseFeed = useMemo(() => {
        const stableBase = uniqById([
            ...(data.recommendations?.latestPosts ?? []),
            ...(data.recommendations?.forYou ?? []),
            ...(data.recommendations?.popularThisWeek ?? []),
            ...data.fallbackPosts
        ]);

        return withSoftFallback(stableBase, data.fallbackPosts);
    }, [data]);

    const tagFilters = useMemo(() => {
        const allTags = new Set<string>();
        [...baseFeed, ...compactEditorPicks, ...(featuredPost ? [featuredPost] : [])]
            .forEach((post) => post.tags.forEach((tag) => allTags.add(tag)));
        return ["All", ...Array.from(allTags).slice(0, 8)];
    }, [baseFeed, compactEditorPicks, featuredPost]);

    const filteredFeed = useMemo(() => {
        const q = debouncedSearch.trim().toLowerCase();
        const filtered = baseFeed.filter((post) => {
            const matchesTag = activeTag === "All" || post.tags.includes(activeTag);
            if (!matchesTag) {
                return false;
            }

            if (!q) {
                return true;
            }

            const haystack = `${post.title} ${post.excerpt} ${post.tags.join(" ")}`.toLowerCase();
            return haystack.includes(q);
        });

        const popularIds = (data.recommendations?.popularThisWeek ?? []).map((post) => post.id);
        const editorIds = uniqById([...(data.recommendations?.editorsPicks ?? []), ...compactEditorPicks]).map((post) => post.id);

        return sortPosts(filtered, sort, popularIds, editorIds);
    }, [activeTag, baseFeed, compactEditorPicks, data.recommendations, debouncedSearch, sort]);

    const isFiltering = activeTag !== "All" || debouncedSearch.trim().length > 0;
    const showFeedEmpty = !loading && isFiltering && filteredFeed.length === 0;

    const toolbarSummary = useMemo(() => {
        if (!isFiltering) {
            return `Showing ${filteredFeed.length} posts`;
        }

        const parts = [`${filteredFeed.length} results`];
        if (activeTag !== "All") {
            parts.push(`tag: ${activeTag}`);
        }
        if (debouncedSearch.trim()) {
            parts.push(`search: “${debouncedSearch.trim()}”`);
        }
        return parts.join(" • ");
    }, [activeTag, debouncedSearch, filteredFeed.length, isFiltering]);

    const handleClearFilters = () => {
        setSearchInput("");
        setActiveTag("All");
    };

    const editorialInsert = compactEditorPicks[0] ?? featuredPost;

    return (
        <main
            className="blog-page"
            style={{
                ["--blog-header-offset" as string]: `${headerOffset}px`
            }}
        >
            <section className="blog-hero section">
                <div className="container blog-hero__inner">
                    <div className="blog-hero__copy">
                        <div className="eyebrow">Tale Shop Blog</div>
                        <h1>News, guides &amp; weekly picks</h1>
                        <p className="hero-subtitle">Curated gaming news, guides, and updates to keep you ahead of the drop.</p>
                    </div>
                </div>
            </section>

            <section className="blog-top section">
                <div className="container blog-top__grid">
                    <div className="blog-top__featured surface">
                        {loading ? (
                            <div className="skeleton h-80" />
                        ) : featuredPost ? (
                            <PostCard post={featuredPost} variant="featured" showFeaturedBadge onTagSelect={setActiveTag} />
                        ) : (
                            <div className="blog-fallback-copy">
                                <h2>No published posts yet</h2>
                                <p className="muted">As soon as new articles are published, your featured story will appear here.</p>
                            </div>
                        )}
                    </div>

                    <aside className="blog-top__rail surface" aria-label="Editor picks">
                        <div className="blog-top__rail-head">
                            <h2>Top picks</h2>
                            <span className="muted">Editor picks</span>
                        </div>

                        {loading ? (
                            <div className="blog-mini-list">
                                {Array.from({length: 3}).map((_, idx) => (
                                    <div className="blog-mini-skeleton" key={`mini-skeleton-${idx}`}>
                                        <div className="skeleton h-20" />
                                    </div>
                                ))}
                            </div>
                        ) : compactEditorPicks.length > 0 ? (
                            <div className="blog-mini-list">
                                {compactEditorPicks.map((post) => (
                                    <PostCard key={post.id} post={post} variant="mini" />
                                ))}
                            </div>
                        ) : (
                            <p className="muted">Editor picks will appear here automatically.</p>
                        )}
                    </aside>
                </div>
            </section>

            <section className="blog-toolbar-wrap section">
                <div className="container">
                    <div className="blog-toolbar surface">
                        <label className="search-field" aria-label="Search articles">
                            <FontAwesomeIcon icon={faMagnifyingGlass} />
                            <input
                                type="search"
                                placeholder="Search articles..."
                                value={searchInput}
                                onChange={(event) => setSearchInput(event.target.value)}
                            />
                        </label>

                        <div className="chip-row" role="list">
                            {tagFilters.map((tag) => (
                                <button
                                    key={tag}
                                    className={`chip ${tag === activeTag ? "chip-active" : ""}`}
                                    onClick={() => setActiveTag(tag)}
                                    type="button"
                                    role="listitem"
                                >
                                    {tag !== "All" ? <FontAwesomeIcon icon={getTagIcon(tag)} /> : null}
                                    <span>{tag}</span>
                                </button>
                            ))}
                        </div>

                        <label className="sort-select">
                            <span className="visually-hidden">Sort posts</span>
                            <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}>
                                {sortOptions.map((option) => (
                                    <option key={option}>{option}</option>
                                ))}
                            </select>
                        </label>

                        {isFiltering ? (
                            <button className="btn btn-outline blog-toolbar__clear" type="button" onClick={handleClearFilters}>
                                Clear filters
                            </button>
                        ) : null}

                        <p className="blog-toolbar__summary muted">{toolbarSummary}</p>
                    </div>
                </div>
            </section>

            <section className="blog-feed section">
                <div className="container">
                    {error ? <p className="blog-feed__warning">{error}</p> : null}

                    {loading ? (
                        <div className="posts-grid">
                            {Array.from({length: 9}).map((_, index) => (
                                <div className="post-card post-card--compact" key={`feed-skeleton-${index}`}>
                                    <div className="post-card__media post-card__media--compact"><div className="skeleton h-32" /></div>
                                    <div className="post-card__body post-card__body--compact"><div className="skeleton h-6" /><div className="skeleton h-4 mt-3" /></div>
                                </div>
                            ))}
                        </div>
                    ) : showFeedEmpty ? (
                        <div className="blog-feed-empty surface">
                            <h3>No posts found</h3>
                            <p className="muted">Try changing search text or selecting another topic.</p>
                            <button className="btn btn-primary" type="button" onClick={handleClearFilters}>Clear filters</button>
                        </div>
                    ) : filteredFeed.length > 0 ? (
                        <>
                            <div className="posts-grid">
                                {filteredFeed.map((post) => (
                                    <PostCard key={post.id} post={post} variant="compact" />
                                ))}
                            </div>

                            {editorialInsert ? (
                                <article className="editorial-insert surface">
                                    <div>
                                        <div className="eyebrow">Picked by Tale team</div>
                                        <h3>{editorialInsert.title}</h3>
                                        <p className="muted">{editorialInsert.excerpt}</p>
                                        <p className="editorial-insert__note">A curated read from our editors to help you decide faster this week.</p>
                                        <p className="editorial-insert__meta">
                                            {formatDate(editorialInsert.publishedAt)}
                                            {editorialInsert.readingTime ? ` • ${editorialInsert.readingTime} min read` : ""}
                                        </p>
                                    </div>
                                    <Link className="btn btn-primary" to={`/blog/${editorialInsert.slug}`}>
                                        Read pick
                                        <FontAwesomeIcon icon={faArrowRightLong} />
                                    </Link>
                                </article>
                            ) : null}
                        </>
                    ) : (
                        <div className="blog-feed-empty surface">
                            <h3>Blog is preparing new stories</h3>
                            <p className="muted">Check back soon for fresh posts and updates.</p>
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
                            <Link className="btn btn-secondary" to="/games">Go to Store</Link>
                            <Link className="btn btn-primary" to="/games">Browse deals</Link>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
