import React, {useEffect, useMemo, useRef, useState} from "react";
import './tale-gameshop-main-page.css';
import '../../font-awesome.ts';
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faArrowRight,
    faBolt,
    faCheckCircle,
    faChessKnight,
    faChevronDown,
    faEnvelope,
    faHatWizard,
    faLeaf,
    faPuzzlePiece,
    faShieldAlt,
    faUsers
} from "@fortawesome/free-solid-svg-icons";
import container from "../../inversify.config";
import type {IApiClient} from "../../iterfaces/i-api-client";
import type {IBlogService} from "../../iterfaces/i-blog-service";
import IDENTIFIERS from "../../constants/identifiers";
import {Game} from "../../models/game";
import {Link} from "react-router-dom";
import {IUrlService} from "../../iterfaces/i-url-service";
import SafeGameImage from "../common/SafeGameImage";
import TestimonialsCarousel from "../testimonials/TestimonialsCarousel";
import type {BlogListItem} from "../../types/blog";

export default function TaleGameshopMainPage() {
    const [latestGame, setLatestGame] = useState<Game | null>(null);
    const [randomGame, setRandomGame] = useState<Game | null>(null);
    const [games, setGames] = useState<Game[]>([]);
    const [blogPosts, setBlogPosts] = useState<BlogListItem[]>([]);
    const [blogLoading, setBlogLoading] = useState(true);

    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    useEffect(() => {
        fetchGames();
    }, []);

    useEffect(() => {
        fetchBlogPosts();
    }, []);

    const fetchGames = async () => {
        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            const response = await apiClient.api.get('/api/game');
            const items: Game[] = response.data;

            if (!items || items.length === 0) {
                throw new Error('No games found');
            }

            const latest = items.reduce((currentLatest: Game | null, current) => {
                return !currentLatest || new Date(current.releaseDate) > new Date(currentLatest.releaseDate)
                    ? current
                    : currentLatest;
            }, null);

            const random = items[Math.floor(Math.random() * items.length)];

            setGames(items);
            setRandomGame(random);
            setLatestGame(latest);
        } catch (err) {
            //
        }
    };

    const fetchBlogPosts = async () => {
        try {
            setBlogLoading(true);
            const blogService = container.get<IBlogService>(IDENTIFIERS.IBlogService);
            const response = await blogService.getPosts({page: 1, pageSize: 5});
            setBlogPosts(response.items);
        } catch (err) {
            console.error(err);
            setBlogPosts([]);
        } finally {
            setBlogLoading(false);
        }
    };

    const featuredGames = useMemo(() => games.slice(0, 10), [games]);
    const featuredRailGames = useMemo(() => featuredGames.slice(0, 6), [featuredGames]);
    const [selectedFeaturedIndex, setSelectedFeaturedIndex] = useState(0);
    const billboardSurfaceRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!featuredRailGames.length) {
            setSelectedFeaturedIndex(0);
            return;
        }

        if (selectedFeaturedIndex > featuredRailGames.length - 1) {
            setSelectedFeaturedIndex(0);
        }
    }, [featuredRailGames, selectedFeaturedIndex]);

    const selectedGame = featuredRailGames[selectedFeaturedIndex] ?? null;
    const heroPrimary = latestGame ?? games[0] ?? null;
    const heroSecondary = randomGame ?? games[1] ?? null;
    const isLoading = games.length === 0;

    const perks = [
        "Shop se payments",
        "Instant delivery",
        "Curated picks"
    ];

    const genres = [
        {title: 'Action', description: 'High-impact firefights and fast pacing.', icon: faBolt},
        {title: 'Puzzle', description: 'Brain-teasing challenges to unwind.', icon: faPuzzlePiece},
        {title: 'RPG', description: 'Deep stories with character growth.', icon: faHatWizard},
        {title: 'Strategy', description: 'Command, conquer, and outthink.', icon: faChessKnight},
        {title: 'Indie', description: 'Curated gems from small teams.', icon: faLeaf},
        {title: 'Co-op', description: 'Jump in together and beat the odds.', icon: faUsers},
    ];

    const featuredBlogPosts = useMemo(() => blogPosts.slice(0, 3), [blogPosts]);
    const highlightPosts = useMemo(() => {
        const highlights = blogPosts.slice(3, 5);
        return highlights.length ? highlights : blogPosts.slice(0, 2);
    }, [blogPosts]);
    const blogFallbackCover = "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=800&q=80";

    const reasons = [
        {
            title: 'Secure payments',
            description: 'Protected checkout with trusted partners.',
            icon: faCheckCircle
        },
        {
            title: 'Instant delivery',
            description: 'Receive your key moments after purchase.',
            icon: faBolt
        },
        {
            title: 'Curated picks',
            description: 'Hand-selected games for every mood.',
            icon: faHatWizard
        },
        {
            title: 'Friendly support',
            description: 'Here to help with installs and access.',
            icon: faUsers
        }
    ];

    const steps = [
        {label: 'Choose a game', helper: 'Browse curated genres and picks.'},
        {label: 'Pay securely', helper: 'Checkout with verified payments.'},
        {label: 'Get your key / download', helper: 'Instant email delivery and quick access.'}
    ];

    const testimonials = [
        {
            quote: 'Instant delivery and great picks. Every purchase has been smooth and fast.',
            name: 'Alex P.',
            role: 'Verified buyer',
            badge: 'Verified purchase'
        },
        {
            quote: 'Love the curated lists—found hidden gems I never would have tried.',
            name: 'Maria K.',
            role: 'Longtime customer',
            badge: 'Verified purchase'
        },
        {
            quote: 'Checkout feels secure and the keys arrive immediately. Support is friendly too.',
            name: 'Samir L.',
            role: 'Verified buyer',
            badge: 'Verified purchase'
        }
    ];

    const trustPoints = [
        {icon: faShieldAlt, title: 'Secure checkout'},
        {icon: faBolt, title: 'Instant email delivery'},
        {icon: faCheckCircle, title: 'Refund policy'},
        {icon: faUsers, title: 'Friendly support'},
        {icon: faHatWizard, title: 'Verified payments'},
    ];

    const faqs = [
        {
            question: 'How do I receive my key?',
            answer: 'Keys are delivered instantly to your email and visible in your account after checkout.'
        },
        {
            question: 'What payment methods do you support?',
            answer: 'We support major cards and verified processors for secure payments.'
        },
        {
            question: 'Can I request a refund?',
            answer: 'Yes. If you experience an issue with your key or access, reach out and we will help.'
        },
        {
            question: 'Is the delivery instant?',
            answer: 'Delivery is typically instant. Most purchases reach your inbox within seconds.'
        },
        {
            question: 'Do you support EN/RU?',
            answer: 'We provide support in EN and RU, and the catalog lists language availability per game.'
        }
    ];

    const [openFaqIndex, setOpenFaqIndex] = useState(0);

    const toggleFaq = (index: number) => {
        setOpenFaqIndex((prev) => (prev === index ? -1 : index));
    };

    const renderGameCard = (game: Game, size: 'large' | 'small') => (
        <div className={`hero-card ${size === 'large' ? 'hero-card-large' : 'hero-card-small'}`}>
            <div className="hero-media">
                <SafeGameImage gameTitle={game.title} src={game?.imagePath} baseUrl={urlService.apiBaseUrl} />
            </div>
            <div className="hero-overlay">
                <span className="hero-title">{game?.title}</span>
                {game?.price !== undefined && (
                    <span className="hero-price">${game.price.toFixed(2)}</span>
                )}
            </div>
        </div>
    );

    const renderHeroSkeleton = (size: 'large' | 'small') => (
        <div
            className={`hero-card ${size === 'large' ? 'hero-card-large' : 'hero-card-small'} skeleton-card`}
            aria-hidden="true"
        >
            <div className="hero-media">
                <div className="media-placeholder skeleton" />
            </div>
            <div className="hero-overlay">
                <span className="skeleton-line skeleton" />
                <span className="skeleton-line skeleton-line-short skeleton" />
            </div>
        </div>
    );


    const handleNextFeatured = () => {
        if (featuredRailGames.length <= 1) {
            return;
        }

        setSelectedFeaturedIndex((prev) => (prev + 1) % featuredRailGames.length);
    };

    const handleBillboardMouseMove: React.MouseEventHandler<HTMLDivElement> = (event) => {
        const surface = billboardSurfaceRef.current;
        if (!surface) {
            return;
        }

        const rect = surface.getBoundingClientRect();
        if (!rect.width || !rect.height) {
            return;
        }

        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        const mx = Math.max(0, Math.min(1, x));
        const my = Math.max(0, Math.min(1, y));

        surface.style.setProperty('--mx', String(mx));
        surface.style.setProperty('--my', String(my));
    };

    const getBillboardDescription = (game: Game | null) => {
        if (!game) {
            return '';
        }

        const cleanDescription = game.description?.trim();
        if (cleanDescription) {
            return cleanDescription.length > 132 ? `${cleanDescription.slice(0, 129)}...` : cleanDescription;
        }

        return 'Instant key delivery with secure checkout and curated picks for your next session.';
    };

    return (
        <div className="main-page">
            <section className="hero">
                <div className="container hero-grid hero-container">
                    <div className="hero-copy">
                        <div className="eyebrow">PARE GAMES</div>
                        <h1>Discover Your Next Favourite Computer Game</h1>
                        <p className="hero-subtext">
                            A curated marketplace built for PC gamers. Browse premium picks, pay securely, and jump in instantly.
                        </p>
                        <div className="hero-perks">
                            {perks.map((perk) => (
                                <div className="hero-perk" key={perk}>
                                    <FontAwesomeIcon icon={faCheckCircle} />
                                    <span>{perk}</span>
                                </div>
                            ))}
                        </div>
                        <div className="hero-actions">
                            <Link to={`/games?filterCategory`} className="btn btn-primary">
                                Shop
                            </Link>
                            <Link to="/about" className="btn btn-outline">
                                Learn more
                            </Link>
                        </div>
                    </div>

                    <div className="hero-showcase">
                        {isLoading ? (
                            <>
                                {renderHeroSkeleton('large')}
                                {renderHeroSkeleton('small')}
                            </>
                        ) : (
                            <>
                                {heroPrimary && renderGameCard(heroPrimary, 'large')}
                                {heroSecondary && renderGameCard(heroSecondary, 'small')}
                            </>
                        )}
                    </div>
                </div>
            </section>

            <section className="featured-billboard">
                <div className="container">
                    <div className="billboard-header">
                        <div>
                            <div className="eyebrow">FEATURED / POPULAR</div>
                            <h2>Featured / Popular games</h2>
                            <div className="billboard-sub">{featuredGames.length} picks • Updated weekly</div>
                        </div>
                        <div className="billboard-actions">
                            <Link className="billboard-link" to="/games">Browse all</Link>
                            <button
                                type="button"
                                className="billboard-next"
                                aria-label="Next pick"
                                onClick={handleNextFeatured}
                                disabled={featuredRailGames.length <= 1}
                            >
                                <FontAwesomeIcon icon={faArrowRight} />
                            </button>
                        </div>
                    </div>

                    <div
                        className="billboard-surface"
                        ref={billboardSurfaceRef}
                        onMouseMove={handleBillboardMouseMove}
                    >
                        {isLoading ? (
                            <>
                                <div className="billboard-left">
                                    <div className="billboard-frame skeleton-card" aria-hidden="true">
                                        <div className="media-placeholder skeleton" />
                                    </div>
                                    <div className="billboard-copy">
                                        <span className="skeleton-line skeleton" />
                                        <span className="skeleton-line skeleton" />
                                        <span className="skeleton-line skeleton-line-short skeleton" />
                                    </div>
                                </div>
                                <aside className="billboard-rail" aria-hidden="true">
                                    {Array.from({length: 5}).map((_, index) => (
                                        <div className="rail-item skeleton-card" key={`featured-skeleton-${index}`}>
                                            <span className="skeleton-line skeleton" />
                                        </div>
                                    ))}
                                </aside>
                            </>
                        ) : selectedGame ? (
                            <>
                                <div className="billboard-left">
                                    <div className="billboard-frame" key={selectedGame.id || selectedGame.title}>
                                        <SafeGameImage
                                            className="billboard-cover"
                                            gameTitle={selectedGame.title}
                                            src={selectedGame.imagePath}
                                            baseUrl={urlService.apiBaseUrl}
                                        />
                                        <div className="billboard-sticker">
                                            <div className="sticker-label">This week</div>
                                            <div className="sticker-price">${selectedGame.price?.toFixed(2) ?? '--'}</div>
                                        </div>
                                    </div>

                                    <div className="billboard-copy">
                                        <div className="billboard-badge">Featured pick</div>
                                        <h3 className="billboard-title">{selectedGame.title}</h3>
                                        <p className="billboard-desc muted">{getBillboardDescription(selectedGame)}</p>

                                        <div className="billboard-cta">
                                            <Link className="btn btn-primary" to={`/games?filterCategory=${encodeURIComponent(selectedGame.title)}`}>
                                                View game
                                            </Link>
                                            <Link className="btn btn-outline" to="/games">
                                                Explore store
                                            </Link>
                                        </div>

                                        <div className="billboard-trust" aria-label="Store trust points">
                                            <span>Instant delivery</span>
                                            <span>Verified payments</span>
                                            <span>Refund policy</span>
                                        </div>
                                    </div>
                                </div>

                                <aside className="billboard-rail" aria-label="Featured picks list">
                                    {featuredRailGames.map((game, idx) => (
                                        <button
                                            type="button"
                                            key={game.id || game.title}
                                            className={`rail-item ${idx === selectedFeaturedIndex ? 'active' : ''}`}
                                            onClick={() => setSelectedFeaturedIndex(idx)}
                                            aria-pressed={idx === selectedFeaturedIndex}
                                        >
                                            <span className="rail-index">{String(idx + 1).padStart(2, '0')}</span>
                                            <span className="rail-name">{game.title}</span>
                                            <span className="rail-price">${game.price.toFixed(2)}</span>
                                        </button>
                                    ))}
                                    <Link className="rail-all" to="/games">View all picks <FontAwesomeIcon icon={faArrowRight} /></Link>
                                </aside>
                            </>
                        ) : null}
                    </div>
                </div>
            </section>

            <section className="explore-blog-section">
                <div className="container">
                    <div className="explore-grid">
                        <div className="explore-column">
                            <div className="column-header">
                                <h3>Explore our games</h3>
                                <p className="muted">Genres curated for every kind of player.</p>
                            </div>
                            <div className="genre-grid">
                                {genres.map((genre) => (
                                    <div className="genre-card" key={genre.title}>
                                        <div className="genre-icon">
                                            <FontAwesomeIcon icon={genre.icon} />
                                        </div>
                                        <div className="genre-copy">
                                            <div className="genre-title">{genre.title}</div>
                                            <div className="genre-description muted">{genre.description}</div>
                                        </div>
                                        <Link className="genre-link" to={`/games?filterCategory=${genre.title}`}>
                                            View
                                        </Link>
                                    </div>
                                ))}
                            </div>
                            <Link className="btn btn-outline full-width" to={`/games`}>
                                Browse all genres
                            </Link>
                        </div>

                        <div className="explore-column">
                            <div className="column-header">
                                <h3>Latest blog posts</h3>
                                <p className="muted">Fresh drops from our editorial team.</p>
                            </div>
                            <div className="blog-list">
                                {blogLoading ? (
                                    Array.from({length: 3}).map((_, index) => (
                                        <div className="blog-item" key={`blog-skeleton-${index}`}>
                                            <div className="blog-thumb skeleton" aria-hidden="true" />
                                            <div className="blog-copy">
                                                <div className="skeleton h-5" />
                                                <div className="skeleton h-4 mt-2" />
                                            </div>
                                        </div>
                                    ))
                                ) : featuredBlogPosts.length === 0 ? (
                                    <div className="muted">Blog posts will appear here once published.</div>
                                ) : (
                                    featuredBlogPosts.map((post) => (
                                        <div className="blog-item" key={post.id}>
                                            <div
                                                className="blog-thumb"
                                                aria-hidden="true"
                                                style={{backgroundImage: `url(${post.coverUrl || blogFallbackCover})`}}
                                            />
                                            <div className="blog-copy">
                                                <div className="blog-title">{post.title}</div>
                                                <div className="blog-snippet muted">{post.excerpt}</div>
                                            </div>
                                            <Link className="text-link" to={`/blog/${post.slug}`}>
                                                Read
                                            </Link>
                                        </div>
                                    ))
                                )}
                            </div>
                            <Link className="btn btn-ghost" to="/blog">
                                Go to blog
                            </Link>
                        </div>

                        <div className="explore-column">
                            <div className="column-header">
                                <h3>Highlights from blog</h3>
                                <p className="muted">Hand-picked stories worth reading.</p>
                            </div>
                            <div className="highlight-stack">
                                {blogLoading ? (
                                    Array.from({length: 2}).map((_, index) => (
                                        <div className="highlight-card" key={`highlight-skeleton-${index}`}>
                                            <div className="highlight-media skeleton" aria-hidden="true" />
                                            <div className="highlight-body">
                                                <div className="skeleton h-4 w-24" />
                                                <div className="skeleton h-5 mt-2" />
                                                <div className="skeleton h-4 mt-2" />
                                            </div>
                                        </div>
                                    ))
                                ) : highlightPosts.length === 0 ? (
                                    <div className="muted">Check back soon for highlight stories.</div>
                                ) : (
                                    highlightPosts.map((item, index) => (
                                        <div className="highlight-card" key={item.id}>
                                            <div
                                                className="highlight-media"
                                                aria-hidden="true"
                                                style={{backgroundImage: `url(${item.coverUrl || blogFallbackCover})`}}
                                            />
                                            <div className="highlight-body">
                                                <div className="highlight-header">
                                                    <span className="highlight-badge">{item.tags[0] ?? (index === 0 ? "Weekly" : "New")}</span>
                                                    <Link className="text-link" to={`/blog/${item.slug}`}>
                                                        Read more
                                                    </Link>
                                                </div>
                                                <div className="highlight-title">{item.title}</div>
                                                <div className="highlight-snippet muted">{item.excerpt}</div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="why-section">
                <div className="container">
                    <div className="section-heading">
                        <h2>Why choose us</h2>
                        <p className="muted">Curated games, secure payments, and delivery in moments.</p>
                    </div>
                    <div className="why-grid">
                        {reasons.map((reason) => (
                            <div className="why-card" key={reason.title}>
                                <div className="why-icon">
                                    <FontAwesomeIcon icon={reason.icon} />
                                </div>
                                <div className="why-copy">
                                    <div className="why-title">{reason.title}</div>
                                    <div className="why-description muted">{reason.description}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="how-section">
                <div className="container">
                    <div className="section-heading">
                        <h2>How it works</h2>
                        <p className="muted">Three simple steps from browsing to playing.</p>
                    </div>
                    <div className="steps-grid">
                        {steps.map((step, index) => (
                            <div className="step-card" key={step.label}>
                                <div className="step-marker">{index + 1}</div>
                                <div className="step-body">
                                    <div className="step-title">{step.label}</div>
                                    <div className="step-helper muted">{step.helper}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="trust-row muted">
                        Refund policy • Verified payments • Instant email delivery
                    </div>
                </div>
            </section>

            <section className="cta-section">
                <div className="container">
                    <div className="cta-card">
                        <div className="cta-copy">
                            <h3>Ready to explore the Store?</h3>
                            <p className="muted">Discover the full catalog and weekly deals.</p>
                        </div>
                        <div className="cta-actions">
                            <Link to="/games" className="btn btn-primary">
                                Go to Store
                            </Link>
                            <Link to={`/games?filterCategory`} className="btn btn-outline">
                                Browse genres
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <TestimonialsCarousel testimonials={testimonials} />

            <section className="trust-section">
                <div className="container">
                    <div className="trust-heading">
                        <h3>Trusted payment & delivery</h3>
                    </div>
                    <div className="trust-items">
                        {trustPoints.map((point) => (
                            <div className="trust-item" key={point.title}>
                                <FontAwesomeIcon icon={point.icon} />
                                <span>{point.title}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="newsletter-section">
                <div className="container">
                    <div className="newsletter-card">
                        <div className="newsletter-copy">
                            <h3>Get weekly deals & rare picks</h3>
                            <p className="muted">No spam. Unsubscribe anytime.</p>
                        </div>
                        <form className="newsletter-form" onSubmit={(e) => e.preventDefault()}>
                            <div className="input-row">
                                <div className="input-icon">
                                    <FontAwesomeIcon icon={faEnvelope} />
                                </div>
                                <input type="email" placeholder="Enter your email" required />
                                <button className="btn btn-primary" type="submit">Subscribe</button>
                            </div>
                            <label className="checkbox-row">
                                <input type="checkbox" defaultChecked />
                                <span>Notify me about price drops</span>
                            </label>
                        </form>
                    </div>
                </div>
            </section>

            <section className="faq-section">
                <div className="container">
                    <div className="section-heading">
                        <h3>Quick FAQ</h3>
                        <p className="muted">Answers to common questions about delivery and payments.</p>
                    </div>
                    <div className="faq-list">
                        {faqs.map((item, index) => (
                            <div
                                className={`faq-item ${openFaqIndex === index ? 'open' : ''}`}
                                key={item.question}
                            >
                                <button className="faq-trigger" onClick={() => toggleFaq(index)}>
                                    <span>{item.question}</span>
                                    <FontAwesomeIcon icon={faChevronDown} />
                                </button>
                                {openFaqIndex === index && (
                                    <div className="faq-answer muted">{item.answer}</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="store-prefooter">
                <div className="container">
                    <div className="store-prefooter-card">
                        <div className="store-prefooter-copy">
                            <h3>Find your next game today</h3>
                            <p className="muted">Step into the full catalog with weekly deals and curated picks.</p>
                        </div>
                        <div className="store-prefooter-actions">
                            <Link to="/games" className="btn btn-primary">Go to Store</Link>
                            <Link to={`/games?filterCategory`} className="btn btn-outline">Browse genres</Link>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
