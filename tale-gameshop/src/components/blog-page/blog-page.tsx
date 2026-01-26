import React, {useCallback, useEffect, useMemo, useState} from "react";
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
import type {BlogListItem} from "../../types/blog";
import "./blog-page.css";

const FALLBACK_COVER = "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1600&q=80";
const PAGE_SIZE = 9;

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
    const [posts, setPosts] = useState<BlogListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchPosts = useCallback(async (requestedPage: number, append = false) => {
        try {
            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }
            setError(null);
            const response = await blogService.getPosts({
                page: requestedPage,
                pageSize: PAGE_SIZE,
                tag: activeTag === "All" ? undefined : activeTag,
                search: search.trim() ? search.trim() : undefined
            });
            setTotal(response.total);
            setPosts((prev) => (append ? [...prev, ...response.items] : response.items));
            setPage(requestedPage);
        } catch (fetchError) {
            console.error(fetchError);
            setError("Unable to load blog posts.");
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [activeTag, blogService, search]);

    useEffect(() => {
        fetchPosts(1, false);
    }, [fetchPosts]);

    const tagFilters = useMemo(() => {
        const tags = new Set<string>();
        posts.forEach((post) => post.tags.forEach((tag) => tags.add(tag)));
        return ["All", ...Array.from(tags).slice(0, 6)];
    }, [posts]);

    const postsByDate = useMemo(() => {
        return [...posts].sort((a, b) => {
            const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
            const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
            return dateB - dateA;
        });
    }, [posts]);

    const postsByReadingTime = useMemo(() => {
        return [...posts].sort((a, b) => (b.readingTime ?? 0) - (a.readingTime ?? 0));
    }, [posts]);

    const featuredPost = postsByDate[0];
    const popularPosts = postsByReadingTime.slice(0, 3);
    const editorsFeatured = postsByDate[1] ?? postsByDate[0];
    const editorsList = postsByDate.slice(2, 6);

    const sortedPosts = useMemo(() => {
        if (sort === "Most popular") {
            return postsByReadingTime;
        }

        if (sort === "Editor's picks") {
            return [...posts].sort((a, b) => a.title.localeCompare(b.title));
        }

        return postsByDate;
    }, [posts, postsByDate, postsByReadingTime, sort]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const pageNumbers = useMemo(() => {
        const start = Math.max(1, Math.min(page - 1, totalPages - 2));
        const end = Math.min(totalPages, start + 2);
        return Array.from({length: end - start + 1}, (_, index) => start + index);
    }, [page, totalPages]);

    const canLoadMore = page * PAGE_SIZE < total;

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
                        <div className="featured-card">
                            <div className="featured-media" aria-hidden="true">
                                <div className="media-overlay" />
                                <img
                                    src={getCover(featuredPost)}
                                    alt={featuredPost.title}
                                />
                            </div>
                            <div className="featured-content">
                                <div className="featured-top">
                                    <span className="badge featured-badge">Featured</span>
                                </div>
                                <h2>{featuredPost.title}</h2>
                                <div className="meta-row">
                                    <span>{formatDate(featuredPost.publishedAt)}</span>
                                    <span className="divider-dot" aria-hidden="true">•</span>
                                    <span>{featuredPost.readingTime ? `${featuredPost.readingTime} min read` : "Quick read"}</span>
                                    {featuredPost.tags[0] && <span className="meta-pill">{featuredPost.tags[0]}</span>}
                                </div>
                                <p className="featured-text">{featuredPost.excerpt}</p>
                                <div className="featured-actions">
                                    <Link className="btn btn-primary" to={`/blog/${featuredPost.slug}`}>Read article</Link>
                                    <button className="btn btn-link" type="button" onClick={() => setActiveTag(featuredPost.tags[0] ?? "All")}
                                    >
                                        View all {featuredPost.tags[0] ?? "posts"}
                                        <FontAwesomeIcon icon={faArrowRightLong} />
                                    </button>
                                </div>
                            </div>
                        </div>
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
                                <div className="post-card" key={`skeleton-${index}`}>
                                    <div className="post-media">
                                        <div className="media-overlay" />
                                        <div className="skeleton h-32" />
                                    </div>
                                    <div className="post-body">
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
                                <article className="post-card" key={post.id}>
                                    <div className="post-media" aria-hidden="true">
                                        {post.tags[0] && <span className="badge category-badge">{post.tags[0]}</span>}
                                        <div className="media-overlay" />
                                        <img src={getCover(post)} alt={post.title} />
                                    </div>
                                    <div className="post-body">
                                        <h3>{post.title}</h3>
                                        <div className="meta-row">
                                            <span>{formatDate(post.publishedAt)}</span>
                                            <span className="divider-dot" aria-hidden="true">•</span>
                                            <span>{post.readingTime ? `${post.readingTime} min read` : "Quick read"}</span>
                                        </div>
                                        <p>{post.excerpt}</p>
                                        <div className="post-footer">
                                            <Link className="link-primary" to={`/blog/${post.slug}`}>
                                                Read more
                                                <FontAwesomeIcon icon={faArrowRightLong} />
                                            </Link>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                    <div className="posts-actions">
                        <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => fetchPosts(page + 1, true)}
                            disabled={!canLoadMore || loadingMore}
                        >
                            {loadingMore ? "Loading..." : "Load more posts"}
                            <FontAwesomeIcon icon={faArrowRightLong} />
                        </button>
                        <nav className="pagination" aria-label="Blog pagination">
                            {pageNumbers.map((pageNumber) => (
                                <button
                                    key={pageNumber}
                                    className={`page-btn ${pageNumber === page ? "active" : ""}`}
                                    type="button"
                                    onClick={() => fetchPosts(pageNumber, false)}
                                >
                                    {pageNumber}
                                </button>
                            ))}
                            {totalPages > pageNumbers[pageNumbers.length - 1] && (
                                <span className="page-ellipsis">…</span>
                            )}
                        </nav>
                    </div>
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
                            <article className="post-card" key={post.id}>
                                <div className="post-media" aria-hidden="true">
                                    {post.tags[0] && <span className="badge category-badge">{post.tags[0]}</span>}
                                    <div className="media-overlay" />
                                    <img src={getCover(post)} alt={post.title} />
                                </div>
                                <div className="post-body">
                                    <h3>{post.title}</h3>
                                    <div className="meta-row">
                                        <span>{formatDate(post.publishedAt)}</span>
                                        <span className="divider-dot" aria-hidden="true">•</span>
                                        <span>{post.readingTime ? `${post.readingTime} min read` : "Quick read"}</span>
                                    </div>
                                    <p>{post.excerpt}</p>
                                    <div className="post-footer">
                                        <Link className="link-primary" to={`/blog/${post.slug}`}>
                                            Read more
                                            <FontAwesomeIcon icon={faArrowRightLong} />
                                        </Link>
                                    </div>
                                </div>
                            </article>
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
                <div className="container editors-layout">
                    {editorsFeatured && (
                        <div className="editors-featured">
                            <div className="post-media" aria-hidden="true">
                                {editorsFeatured.tags[0] && <span className="badge category-badge">{editorsFeatured.tags[0]}</span>}
                                <div className="media-overlay" />
                                <img src={getCover(editorsFeatured)} alt={editorsFeatured.title} />
                            </div>
                            <div className="post-body">
                                <h3>{editorsFeatured.title}</h3>
                                <p>{editorsFeatured.excerpt}</p>
                                <div className="meta-row">
                                    <span>{formatDate(editorsFeatured.publishedAt)}</span>
                                    <span className="divider-dot" aria-hidden="true">•</span>
                                    <span>{editorsFeatured.readingTime ? `${editorsFeatured.readingTime} min read` : "Quick read"}</span>
                                </div>
                                <Link className="link-primary" to={`/blog/${editorsFeatured.slug}`}>
                                    Read more
                                    <FontAwesomeIcon icon={faArrowRightLong} />
                                </Link>
                            </div>
                        </div>
                    )}
                    <div className="editors-list">
                        <div className="editors-list-header">
                            <h2>Editor&apos;s picks</h2>
                            <Link className="link-primary" to="/blog">
                                View all
                                <FontAwesomeIcon icon={faArrowRightLong} />
                            </Link>
                        </div>
                        <div className="editors-list-items">
                            {editorsList.map((item) => (
                                <article className="mini-post" key={item.id}>
                                    <div className="mini-thumb" aria-hidden="true">
                                        <img src={getCover(item)} alt={item.title} />
                                    </div>
                                    <div>
                                        <h4>{item.title}</h4>
                                        <div className="meta-row">
                                            <span>{formatDate(item.publishedAt)}</span>
                                            <span className="divider-dot" aria-hidden="true">•</span>
                                            <span>{item.readingTime ? `${item.readingTime} min read` : "Quick read"}</span>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                        <div className="editors-dots" aria-hidden="true">
                            <button className="dot-btn" type="button">
                                <FontAwesomeIcon icon={faChevronLeft} />
                            </button>
                            <div className="dot-track">
                                <span className="dot active" />
                                <span className="dot" />
                                <span className="dot" />
                                <span className="dot" />
                            </div>
                            <button className="dot-btn" type="button">
                                <FontAwesomeIcon icon={faChevronRight} />
                            </button>
                        </div>
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
