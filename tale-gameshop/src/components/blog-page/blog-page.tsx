import React, {useEffect, useMemo, useState} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faArrowRightLong,
    faCompass,
    faGamepad,
    faMagnifyingGlass,
    faChevronLeft,
    faChevronRight,
    faShieldHalved,
    faTags,
    faUserGroup
} from "@fortawesome/free-solid-svg-icons";
import {Link} from "react-router-dom";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type {IBlogService} from "../../iterfaces/i-blog-service";
import type {BlogListItem, BlogRecommendationsResponse} from "../../types/blog";
import PostCard from "../../pages/blog/components/PostCard";
import {getAnonId} from "../../hooks/use-blog-tracking";
import "./blog-page.css";

const FALLBACK_COVER = "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1600&q=80";
const RECOMMENDATION_LIMIT = 6;

const sortOptions = ["Newest", "Most popular", "Editor's picks"];

const topicCards = [
    {
        title: "Buying guides",
        description: "Builds, bundles, and platform picks tailored to your play style.",
        highlights: ["Budget builds", "Platform picks"],
        icon: faCompass
    },
    {
        title: "Deals",
        description: "Fresh discounts on games, DLC, and hardware worth bookmarking.",
        highlights: ["Fresh cuts", "Bundles"],
        icon: faTags
    },
    {
        title: "Reviews",
        description: "Hands-on impressions that focus on feel, pacing, and replayability.",
        highlights: ["Feel & pacing", "Replayability"],
        icon: faGamepad
    },
    {
        title: "Security & refunds",
        description: "Stay safe with keys, receipts, and store policies that protect you.",
        highlights: ["Receipts & protection", "Key safety"],
        icon: faShieldHalved
    },
    {
        title: "Updates",
        description: "Patch notes, quality-of-life fixes, and roadmap highlights.",
        highlights: ["Roadmaps", "QoL fixes"],
        icon: faUserGroup
    },
    {
        title: "Community",
        description: "Spotlights on co-op nights, fan creations, and friendly servers.",
        highlights: ["Co-op events", "Player tips"],
        icon: faArrowRightLong
    }
];

const formatDate = (value?: string) => {
    if (!value) {
        return "Draft";
    }
    return new Date(value).toLocaleDateString();
};

const getCover = (post: BlogListItem) => post.coverUrl || FALLBACK_COVER;

export default function BlogPage() {
    const blogService = container.get<IBlogService>(IDENTIFIERS.IBlogService);
    const [activeTag, setActiveTag] = useState("All");
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState(sortOptions[0]);
    const [recommendations, setRecommendations] = useState<BlogRecommendationsResponse | null>(null);
    const [editorsSliderPosts, setEditorsSliderPosts] = useState<BlogListItem[]>([]);
    const [activeEditorSlide, setActiveEditorSlide] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
                    blogService.getPosts({ page: 1, pageSize: 5, featured: true })
                ]);

                setRecommendations(recommendationResponse);

                if (featuredResponse.items.length > 0) {
                    setEditorsSliderPosts(featuredResponse.items);
                } else {
                    const fallbackResponse = await blogService.getPosts({ page: 1, pageSize: 3 });
                    setEditorsSliderPosts(fallbackResponse.items.slice(0, 3));
                }
            } catch (fetchError) {
                console.error(fetchError);
                setError("Unable to load blog posts.");
                setEditorsSliderPosts([]);
            } finally {
                setLoading(false);
            }
        };

        fetchRecommendations();
    }, [blogService]);

    useEffect(() => {
        setActiveEditorSlide(0);
    }, [editorsSliderPosts.length]);

    const tagFilters = useMemo(() => {
        const tags = new Set<string>();
        const allPosts: BlogListItem[] = [
            ...(recommendations?.latestPosts ?? []),
            ...(recommendations?.popularThisWeek ?? []),
            ...(recommendations?.editorsPicks ?? []),
            ...(recommendations?.forYou ?? [])
        ];
        if (recommendations?.heroPost) {
            allPosts.push(recommendations.heroPost);
        }
        allPosts.forEach((post) => post.tags.forEach((tag) => tags.add(tag)));
        return ["All", ...Array.from(tags).slice(0, 6)];
    }, [recommendations]);

    const matchesFilters = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();
        return (post: BlogListItem) => {
            const matchesTag = activeTag === "All" || post.tags.includes(activeTag);
            if (!normalizedSearch) {
                return matchesTag;
            }
            const text = `${post.title} ${post.excerpt}`.toLowerCase();
            return matchesTag && text.includes(normalizedSearch);
        };
    }, [activeTag, search]);

    const featuredPost = recommendations?.heroPost;
    const latestPosts = (recommendations?.latestPosts ?? []).filter(matchesFilters);
    const popularPosts = (recommendations?.popularThisWeek ?? []).filter(matchesFilters);
    const forYouPosts = (recommendations?.forYou?.length ? recommendations.forYou : recommendations?.popularThisWeek ?? [])
        .filter(matchesFilters);

    const editorCandidates = useMemo(() => {
        return editorsSliderPosts.filter(matchesFilters);
    }, [editorsSliderPosts, matchesFilters]);

    const mainEditorPost = useMemo(() => {
        if (editorCandidates.length === 0) {
            return null;
        }

        const manuallySelected = editorCandidates.find((post) => post.mainFeatured);
        if (manuallySelected) {
            return manuallySelected;
        }

        return editorCandidates[0] ?? null;
    }, [editorCandidates]);

    const sideEditorPosts = useMemo(() => {
        return editorCandidates.filter((post) => post.id !== mainEditorPost?.id);
    }, [editorCandidates, mainEditorPost]);

    const sidePageCount = Math.max(1, Math.ceil(sideEditorPosts.length / 3));
    const sidePageStart = activeEditorSlide * 3;
    const visibleSidePosts = sideEditorPosts.slice(sidePageStart, sidePageStart + 3);

    const handlePrevEditorSlide = () => {
        if (sidePageCount <= 1) {
            return;
        }
        setActiveEditorSlide((prev) => (prev - 1 + sidePageCount) % sidePageCount);
    };

    const handleNextEditorSlide = () => {
        if (sidePageCount <= 1) {
            return;
        }
        setActiveEditorSlide((prev) => (prev + 1) % sidePageCount);
    };

    const sortedPosts = useMemo(() => {
        if (sort === "Most popular") {
            return [...latestPosts].sort((a, b) => (b.readingTime ?? 0) - (a.readingTime ?? 0));
        }

        if (sort === "Editor's picks") {
            return [...latestPosts].sort((a, b) => a.title.localeCompare(b.title));
        }

        return [...latestPosts].sort((a, b) => {
            const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
            const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
            return dateB - dateA;
        });
    }, [latestPosts, sort]);

    return (
        <main className="blog-page">
            <section className="blog-hero section">
                <div className="container blog-hero__inner">
                    <div className="blog-hero__copy">
                        <div className="eyebrow">TALE SHOP BLOG</div>
                        <h1>News, guides &amp; weekly picks</h1>
                        <p className="hero-subtitle">Curated gaming news, practical guides, and weekly deals picked by the Tale team to keep you ahead of the drop.</p>
                    </div>
                    <div className="blog-hero__actions">
                        <label className="search-field" aria-label="Search articles">
                            <FontAwesomeIcon icon={faMagnifyingGlass} />
                            <input
                                type="search"
                                placeholder="Search articles…"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                            />
                        </label>
                        <div className="chip-row" role="list">
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
                    </div>
                </div>
            </section>

            <section className="blog-featured section">
                <div className="container">
                    {loading ? (
                        <div className="skeleton h-80" />
                    ) : error ? (
                        <div className="featured-card">
                            <div className="featured-content">
                                <h2>Unable to load featured post</h2>
                                <p className="featured-text">{error}</p>
                            </div>
                        </div>
                    ) : featuredPost ? (
                        <PostCard
                            post={featuredPost}
                            variant="featured"
                            showFeaturedBadge
                            showActions
                            onTagSelect={(tag) => setActiveTag(tag)}
                        />
                    ) : (
                        <div className="featured-card">
                            <div className="featured-content">
                                <h2>No posts yet</h2>
                                <p className="featured-text">Once posts are published, the latest highlight will appear here.</p>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <section className="latest-posts section">
                <div className="container">
                    <div className="latest-header">
                        <h2>Latest posts</h2>
                        <label className="sort-select">
                            <span className="visually-hidden">Sort posts</span>
                            <select value={sort} onChange={(event) => setSort(event.target.value)}>
                                {sortOptions.map((option) => (
                                    <option key={option}>{option}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    {loading ? (
                        <div className="posts-grid">
                            {Array.from({length: 6}).map((_, index) => (
                                <div className="post-card post-card--compact" key={`skeleton-${index}`}>
                                    <div className="post-card__media post-card__media--compact">
                                        <div className="media-overlay" />
                                        <div className="skeleton h-32" />
                                    </div>
                                    <div className="post-card__body post-card__body--compact">
                                        <div className="skeleton h-6" />
                                        <div className="skeleton h-4 mt-3" />
                                        <div className="skeleton h-16 mt-4" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <p className="muted">{error}</p>
                    ) : sortedPosts.length === 0 ? (
                        <p className="muted">No posts match your filters yet. Try a different search or tag.</p>
                    ) : (
                        <div className="posts-grid">
                            {sortedPosts.map((post) => (
                                <PostCard post={post} key={post.id} variant="compact" />
                            ))}
                        </div>
                    )}
                    <div className="posts-actions">
                        <span className="muted">Showing curated recommendations tailored to your interests.</span>
                    </div>
                </div>
            </section>

            <section className="popular-posts section">
                <div className="container">
                    <div className="popular-header">
                        <h2>For you</h2>
                        <Link className="link-primary" to="/blog">
                            View all
                            <FontAwesomeIcon icon={faArrowRightLong} />
                        </Link>
                    </div>
                    {loading ? (
                        <div className="posts-grid popular-grid">
                            {Array.from({length: 3}).map((_, index) => (
                                <div className="post-card post-card--compact" key={`for-you-skeleton-${index}`}>
                                    <div className="post-card__media post-card__media--compact">
                                        <div className="media-overlay" />
                                        <div className="skeleton h-32" />
                                    </div>
                                    <div className="post-card__body post-card__body--compact">
                                        <div className="skeleton h-6" />
                                        <div className="skeleton h-4 mt-3" />
                                        <div className="skeleton h-16 mt-4" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : forYouPosts.length === 0 ? (
                        <p className="muted">We are learning your tastes. Check back after reading a few posts.</p>
                    ) : (
                        <div className="posts-grid popular-grid">
                            {forYouPosts.map((post) => (
                                <PostCard post={post} key={post.id} variant="compact" />
                            ))}
                        </div>
                    )}
                </div>
            </section>

            <section className="popular-posts section">
                <div className="container">
                    <div className="popular-header">
                        <h2>Popular this week</h2>
                        <Link className="link-primary" to="/blog">
                            View all
                            <FontAwesomeIcon icon={faArrowRightLong} />
                        </Link>
                    </div>
                    <div className="posts-grid popular-grid">
                        {popularPosts.map((post) => (
                            <PostCard post={post} key={post.id} variant="compact" />
                        ))}
                    </div>
                </div>
            </section>

            <section className="browse-topics section">
                <div className="container">
                    <div className="section-header">
                        <div>
                            <h2>Browse by topic</h2>
                            <p className="section-subtitle">
                                Find what you need faster: guides, deals, reviews and updates.
                            </p>
                        </div>
                        <div className="chip-row topic-chips" role="list">
                            {tagFilters.slice(1).map((topic) => (
                                <button key={topic} className="chip" type="button" role="listitem" onClick={() => setActiveTag(topic)}>
                                    {topic}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="topic-grid">
                        {topicCards.map((topic) => (
                            <article className="topic-card" key={topic.title}>
                                <div className="topic-icon" aria-hidden="true">
                                    <FontAwesomeIcon icon={topic.icon} />
                                </div>
                                <div className="topic-body">
                                    <h3>{topic.title}</h3>
                                    <p>{topic.description}</p>
                                    <ul className="topic-bullets">
                                        {topic.highlights.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                    <Link className="link-primary" to="/blog">
                                        Explore
                                        <FontAwesomeIcon icon={faArrowRightLong} />
                                    </Link>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="editors-picks section">
                <div className="container">
                    <h2 className="editors-title">Editor&apos;s picks</h2>
                    <div className="editors-layout">
                        {mainEditorPost ? (
                            <article className="editors-main-card">
                                <img className="editors-main-image" src={getCover(mainEditorPost)} alt={mainEditorPost.title} />
                                <div className="editors-main-body">
                                    {mainEditorPost.tags[0] && <span className="editors-main-tag">{mainEditorPost.tags[0]}</span>}
                                    <h3>{mainEditorPost.title}</h3>
                                    <p>{mainEditorPost.excerpt}</p>
                                    <div className="editors-main-meta">{formatDate(mainEditorPost.publishedAt)} • {mainEditorPost.readingTime ?? 5} min read</div>
                                    <Link className="btn btn-primary editors-main-cta" to={`/blog/${mainEditorPost.slug}`}>
                                        Read more
                                        <FontAwesomeIcon icon={faArrowRightLong} />
                                    </Link>
                                </div>
                            </article>
                        ) : (
                            <div className="editors-empty">No featured posts yet.</div>
                        )}

                        <aside className="editors-side-card">
                            <div className="editors-side-list">
                                {visibleSidePosts.map((item) => (
                                    <Link className="editors-side-item" key={item.id} to={`/blog/${item.slug}`}>
                                        <img src={getCover(item)} alt={item.title} />
                                        <div>
                                            <h4>{item.title}</h4>
                                            <p>{formatDate(item.publishedAt)} • {item.readingTime ?? 5} min read</p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                            {sidePageCount > 1 && (
                                <div className="editors-dots" aria-label="Editor picks slider controls">
                                    <button className="dot-btn" type="button" onClick={handlePrevEditorSlide}>
                                        <FontAwesomeIcon icon={faChevronLeft} />
                                    </button>
                                    <div className="dot-track">
                                        {Array.from({ length: sidePageCount }).map((_, index) => (
                                            <button
                                                key={index}
                                                className={`dot ${index === activeEditorSlide ? "active" : ""}`}
                                                type="button"
                                                aria-label={`Go to page ${index + 1}`}
                                                onClick={() => setActiveEditorSlide(index)}
                                            />
                                        ))}
                                    </div>
                                    <button className="dot-btn" type="button" onClick={handleNextEditorSlide}>
                                        <FontAwesomeIcon icon={faChevronRight} />
                                    </button>
                                </div>
                            )}
                        </aside>
                    </div>
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
