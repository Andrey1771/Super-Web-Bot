import React, {useMemo, useState} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faArrowRightLong,
    faCompass,
    faGamepad,
    faMagnifyingGlass,
    faShieldHalved,
    faTags,
    faUserGroup
} from "@fortawesome/free-solid-svg-icons";
import {Link} from "react-router-dom";
import "./blog-page.css";

interface BlogPost {
    title: string;
    description: string;
    category: "Deals" | "Guides" | "Reviews" | "Updates";
    date: string;
    readTime: string;
    image: string;
}

const filters: Array<BlogPost["category"] | "All"> = ["All", "Deals", "Guides", "Reviews", "Updates"];

const blogPosts: BlogPost[] = [
    {
        title: "How to build a budget-friendly gaming rig",
        description: "Pick the right GPU, CPU, and storage without overspending on extras you do not need.",
        category: "Guides",
        date: "April 23",
        readTime: "7 min read",
        image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80"
    },
    {
        title: "Cozy co-op gems for your next game night",
        description: "Chill adventures, light puzzles, and teamwork-first titles that keep everyone smiling.",
        category: "Reviews",
        date: "April 20",
        readTime: "6 min read",
        image: "https://images.unsplash.com/photo-1527443224154-d27e43401652?auto=format&fit=crop&w=1200&q=80"
    },
    {
        title: "Indie highlights: narrative worlds worth binging",
        description: "Short, story-rich campaigns that deliver memorable characters and surprising twists.",
        category: "Guides",
        date: "April 18",
        readTime: "5 min read",
        image: "https://images.unsplash.com/photo-1542751110-97427bbecf20?auto=format&fit=crop&w=1200&q=80"
    },
    {
        title: "Weekend wishlist: tactical RPGs under $20",
        description: "Turn-based battles, deep builds, and exploration that will not drain your wallet.",
        category: "Deals",
        date: "April 16",
        readTime: "4 min read",
        image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80"
    },
    {
        title: "Performance tips: smoother frames on any setup",
        description: "Simple tweaks for drivers, overlays, and settings to keep your favorite games sharp.",
        category: "Guides",
        date: "April 12",
        readTime: "8 min read",
        image: "https://images.unsplash.com/photo-1551033406-611cf9a28f67?auto=format&fit=crop&w=1200&q=80"
    },
    {
        title: "Indie studio spotlight: crafting worlds with heart",
        description: "A behind-the-scenes chat about storytelling, art direction, and player-first design.",
        category: "Reviews",
        date: "April 10",
        readTime: "6 min read",
        image: "https://images.unsplash.com/photo-1523966211575-eb4a017e3cc5?auto=format&fit=crop&w=1200&q=80"
    },
    {
        title: "Patch notes: quality-of-life fixes worth trying",
        description: "A quick roundup of optimizations, controller tweaks, and UI passes shipping this week.",
        category: "Updates",
        date: "April 8",
        readTime: "4 min read",
        image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80"
    },
    {
        title: "Designing your co-op session zero",
        description: "Session rules, safety tools, and character hooks to make the first night smooth and fun.",
        category: "Guides",
        date: "April 6",
        readTime: "5 min read",
        image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80"
    },
    {
        title: "Hardware drops: week in accessories and add-ons",
        description: "Controllers, headsets, and SSDs that pair well with spring releases.",
        category: "Deals",
        date: "April 4",
        readTime: "3 min read",
        image: "https://images.unsplash.com/photo-1512499617640-c2f999098c01?auto=format&fit=crop&w=1200&q=80"
    },
    {
        title: "Early impressions: cozy builder sandbox",
        description: "A serene island loop with charming quests, crafting chains, and a relaxed pace.",
        category: "Reviews",
        date: "April 2",
        readTime: "6 min read",
        image: "https://images.unsplash.com/photo-1472457897821-70d3819a0e24?auto=format&fit=crop&w=1200&q=80"
    },
    {
        title: "Accessibility spotlight: small settings that matter",
        description: "Remappable keys, subtitle polish, and contrast modes that keep more players in the loop.",
        category: "Updates",
        date: "March 30",
        readTime: "5 min read",
        image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80"
    }
];

const popularPosts: BlogPost[] = [
    {
        title: "Community picks: couch co-op stars",
        description: "Wholesome runs, puzzle duos, and story modes the Tale team replays weekly.",
        category: "Reviews",
        date: "April 22",
        readTime: "5 min read",
        image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80"
    },
    {
        title: "Speedy storage upgrades for lighter load times",
        description: "Entry-level NVMe picks, install steps, and how to trim the price tag.",
        category: "Deals",
        date: "April 18",
        readTime: "4 min read",
        image: "https://images.unsplash.com/photo-1472457897821-70d3819a0e24?auto=format&fit=crop&w=1200&q=80"
    },
    {
        title: "Control settings to reduce motion fatigue",
        description: "Camera curves, FOV tweaks, and HUD trims that make long sessions easier on the eyes.",
        category: "Guides",
        date: "April 15",
        readTime: "6 min read",
        image: "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80"
    }
];

const topicFilters = ["Steam", "RPG", "Co-op", "Indie", "Under $20", "Key safety"];

const topicCards = [
    {
        title: "Buying guides",
        description: "Builds, bundles, and platform picks tailored to your play style.",
        icon: faCompass
    },
    {
        title: "Deals",
        description: "Fresh discounts on games, DLC, and hardware worth bookmarking.",
        icon: faTags
    },
    {
        title: "Reviews",
        description: "Hands-on impressions that focus on feel, pacing, and replayability.",
        icon: faGamepad
    },
    {
        title: "Security & refunds",
        description: "Stay safe with keys, receipts, and store policies that protect you.",
        icon: faShieldHalved
    },
    {
        title: "Updates",
        description: "Patch notes, quality-of-life fixes, and roadmap highlights.",
        icon: faUserGroup
    },
    {
        title: "Community",
        description: "Spotlights on co-op nights, fan creations, and friendly servers.",
        icon: faArrowRightLong
    }
];

const editorsPicks = {
    featured: {
        title: "Worldbuilding on a budget: standout indie RPGs",
        description: "Explore rich narratives, flexible builds, and co-op friendly quests without breaking the bank.",
        tag: "RPG",
        date: "May 2",
        readTime: "6 min read",
        image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1600&q=80"
    },
    list: [
        {
            title: "Fresh co-op arrivals for weekend raids",
            date: "May 1",
            readTime: "4 min read",
            image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=80"
        },
        {
            title: "Indie dev diaries: crafting meaningful choices",
            date: "April 30",
            readTime: "5 min read",
            image: "https://images.unsplash.com/photo-1527443224154-d27e43401652?auto=format&fit=crop&w=900&q=80"
        },
        {
            title: "Accessibility wins we loved this month",
            date: "April 28",
            readTime: "6 min read",
            image: "https://images.unsplash.com/photo-1523966211575-eb4a017e3cc5?auto=format&fit=crop&w=900&q=80"
        }
    ]
};

export default function BlogPage() {
    const [activeFilter, setActiveFilter] = useState<typeof filters[number]>("All");
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState("Newest");

    const filteredPosts = useMemo(() => {
        return blogPosts
            .filter((post) => activeFilter === "All" || post.category === activeFilter)
            .filter((post) => post.title.toLowerCase().includes(search.toLowerCase()) || post.description.toLowerCase().includes(search.toLowerCase()));
    }, [activeFilter, search]);

    const sortedPosts = useMemo(() => {
        const withSortableDate = filteredPosts.map((post) => ({
            ...post,
            sortDate: new Date(`${post.date} 2024`).getTime(),
            sortReadTime: Number.parseInt(post.readTime, 10) || 0
        }));

        return withSortableDate.sort((a, b) => {
            if (sort === "Newest") {
                return b.sortDate - a.sortDate;
            }

            if (sort === "Most popular") {
                return b.sortReadTime - a.sortReadTime;
            }

            return a.title.localeCompare(b.title);
        });
    }, [filteredPosts, sort]);

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
                            {filters.map((filter) => (
                                <button
                                    key={filter}
                                    className={`chip ${filter === activeFilter ? "chip-active" : ""}`}
                                    onClick={() => setActiveFilter(filter)}
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
                    <div className="featured-card">
                        <div className="featured-media" aria-hidden="true">
                            <div className="media-overlay" />
                            <img
                                src="https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1600&q=80"
                                alt="Collage of colorful game controllers and accessories"
                            />
                        </div>
                        <div className="featured-content">
                            <div className="featured-top">
                                <span className="badge featured-badge">Featured</span>
                            </div>
                            <h2>Weekly Deals: Top 10 picks under $15</h2>
                            <div className="meta-row">
                                <span>April 25</span>
                                <span className="divider-dot" aria-hidden="true">•</span>
                                <span>5 min read</span>
                                <span className="meta-pill">Deals</span>
                            </div>
                            <p className="featured-text">Handpicked discounts on fan favorites, indie surprises, and DLC bundles so you can stack your backlog without stretching the budget.</p>
                            <div className="featured-actions">
                                <button className="btn btn-primary" type="button">Read article</button>
                                <Link className="btn btn-link" to="#">
                                    View all deals
                                    <FontAwesomeIcon icon={faArrowRightLong} />
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="latest-posts section">
                <div className="container">
                    <div className="latest-header">
                        <h2>Latest posts</h2>
                        <label className="sort-select">
                            <span className="visually-hidden">Sort posts</span>
                            <select value={sort} onChange={(event) => setSort(event.target.value)}>
                                <option>Newest</option>
                                <option>Most popular</option>
                                <option>Editor's picks</option>
                            </select>
                        </label>
                    </div>
                    <div className="posts-grid">
                        {sortedPosts.map((post) => (
                            <article className="post-card" key={post.title}>
                                <div className="post-media" aria-hidden="true">
                                    <span className="badge category-badge">{post.category}</span>
                                    <div className="media-overlay" />
                                    <img src={post.image} alt="" />
                                </div>
                                <div className="post-body">
                                    <h3>{post.title}</h3>
                                    <div className="meta-row">
                                        <span>{post.date}</span>
                                        <span className="divider-dot" aria-hidden="true">•</span>
                                        <span>{post.readTime}</span>
                                    </div>
                                    <p>{post.description}</p>
                                    <div className="post-footer">
                                        <Link className="link-primary" to="#">
                                            Read more
                                            <FontAwesomeIcon icon={faArrowRightLong} />
                                        </Link>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                    <div className="posts-actions">
                        <button className="btn btn-ghost" type="button">
                            Load more posts
                            <FontAwesomeIcon icon={faArrowRightLong} />
                        </button>
                        <nav className="pagination" aria-label="Blog pagination">
                            <button className="page-btn active" type="button">1</button>
                            <button className="page-btn" type="button">2</button>
                            <button className="page-btn" type="button">3</button>
                            <span className="page-ellipsis">…</span>
                        </nav>
                    </div>
                </div>
            </section>

            <section className="popular-posts section">
                <div className="container">
                    <div className="popular-header">
                        <h2>Popular this week</h2>
                        <Link className="link-primary" to="#">
                            View all
                            <FontAwesomeIcon icon={faArrowRightLong} />
                        </Link>
                    </div>
                    <div className="posts-grid popular-grid">
                        {popularPosts.map((post) => (
                            <article className="post-card" key={post.title}>
                                <div className="post-media" aria-hidden="true">
                                    <span className="badge category-badge">{post.category}</span>
                                    <div className="media-overlay" />
                                    <img src={post.image} alt="" />
                                </div>
                                <div className="post-body">
                                    <h3>{post.title}</h3>
                                    <div className="meta-row">
                                        <span>{post.date}</span>
                                        <span className="divider-dot" aria-hidden="true">•</span>
                                        <span>{post.readTime}</span>
                                    </div>
                                    <p>{post.description}</p>
                                    <div className="post-footer">
                                        <Link className="link-primary" to="#">
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
                            {topicFilters.map((topic) => (
                                <button key={topic} className="chip" type="button" role="listitem">
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
                                    <Link className="link-primary" to="#">
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
                    <div className="editors-featured">
                        <div className="post-media" aria-hidden="true">
                            <span className="badge category-badge">{editorsPicks.featured.tag}</span>
                            <div className="media-overlay" />
                            <img src={editorsPicks.featured.image} alt="" />
                        </div>
                        <div className="post-body">
                            <h3>{editorsPicks.featured.title}</h3>
                            <p>{editorsPicks.featured.description}</p>
                            <div className="meta-row">
                                <span>{editorsPicks.featured.date}</span>
                                <span className="divider-dot" aria-hidden="true">•</span>
                                <span>{editorsPicks.featured.readTime}</span>
                            </div>
                            <Link className="link-primary" to="#">
                                Read more
                                <FontAwesomeIcon icon={faArrowRightLong} />
                            </Link>
                        </div>
                    </div>
                    <div className="editors-list">
                        <div className="editors-list-header">
                            <h2>Editor&apos;s picks</h2>
                            <Link className="link-primary" to="#">
                                View all
                                <FontAwesomeIcon icon={faArrowRightLong} />
                            </Link>
                        </div>
                        <div className="editors-list-items">
                            {editorsPicks.list.map((item) => (
                                <article className="mini-post" key={item.title}>
                                    <div className="mini-thumb" aria-hidden="true">
                                        <img src={item.image} alt="" />
                                    </div>
                                    <div>
                                        <h4>{item.title}</h4>
                                        <div className="meta-row">
                                            <span>{item.date}</span>
                                            <span className="divider-dot" aria-hidden="true">•</span>
                                            <span>{item.readTime}</span>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                        <div className="editors-dots" aria-hidden="true">
                            <span className="dot active" />
                            <span className="dot" />
                            <span className="dot" />
                            <span className="dot" />
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
