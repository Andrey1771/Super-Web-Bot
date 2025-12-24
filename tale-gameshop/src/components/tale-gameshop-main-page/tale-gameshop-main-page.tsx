import React, {useEffect, useMemo, useState} from "react";
import './tale-gameshop-main-page.css'
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
    faStar,
    faUsers
} from "@fortawesome/free-solid-svg-icons";
import container from "../../inversify.config";
import type {IApiClient} from "../../iterfaces/i-api-client";
import IDENTIFIERS from "../../constants/identifiers";
import {Game} from "../../models/game";
import {Link} from "react-router-dom";
import {IUrlService} from "../../iterfaces/i-url-service";

export default function TaleGameshopMainPage() {
    const [latestGame, setLatestGame] = useState<Game | null>(null);
    const [randomGame, setRandomGame] = useState<Game | null>(null);
    const [games, setGames] = useState<Game[]>([]);

    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    useEffect(() => {
        fetchGames();
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

    const featuredGames = useMemo(() => games.slice(0, 10), [games]);
    const heroPrimary = latestGame ?? games[0];
    const heroSecondary = randomGame ?? games[1];

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

    const blogPosts = [
        {title: 'Top strategy releases to try this month', snippet: 'Quick picks across tactics, city-builders, and RTS.', link: '/blog'},
        {title: 'Why cozy sims are perfect for weekends', snippet: 'Slow-life games that help you unwind and reset.', link: '/blog'},
        {title: 'Essential RPGs for story-first players', snippet: 'Narrative-driven worlds with unforgettable casts.', link: '/blog'},
    ];

    const highlights = [
        {
            title: 'Weekly spotlight: Atmospheric adventures',
            snippet: 'Lose yourself in moody worlds with strong art direction.',
            badge: 'Weekly',
            link: '/blog'
        },
        {
            title: 'New: Building the perfect co-op night',
            snippet: 'Snackable missions, balanced roles, and low-friction lobbies.',
            badge: 'New',
            link: '/blog'
        }
    ];

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
        <div className={`hero-card ${size}`}>
            {game?.imagePath && (
                <img alt={game.title} src={`${urlService.apiBaseUrl}/${game.imagePath}`}/>
            )}
            <div className="hero-overlay">
                <span className="title">{game?.title}</span>
                {game?.price !== undefined && (
                    <span className="price">${game.price.toFixed(2)}</span>
                )}
            </div>
        </div>
    );

    return (
        <div className="main-page">
            <section className="hero">
                <div className="container hero-grid">
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
                        {heroPrimary && renderGameCard(heroPrimary, 'large')}
                        {heroSecondary && renderGameCard(heroSecondary, 'small')}
                    </div>
                </div>
            </section>

            <section className="featured-section">
                <div className="container">
                    <div className="section-header">
                        <div>
                            <div className="eyebrow">Featured / Popular</div>
                            <h2>Featured / Popular games</h2>
                        </div>
                        <div className="carousel-actions">
                            <Link to={`/games`} className="icon-button" aria-label="Browse more games">
                                <FontAwesomeIcon icon={faArrowRight} />
                            </Link>
                        </div>
                    </div>

                    <div className="featured-scroller">
                        {featuredGames.map((game) => (
                            <Link to={`/games?filterCategory=${game.title}`} className="featured-card" key={game.id || game.title}>
                                <div className="featured-media">
                                    {game.imagePath && (
                                        <img alt={game.title} src={`${urlService.apiBaseUrl}/${game.imagePath}`}/>
                                    )}
                                </div>
                                <div className="featured-meta">
                                    <span className="title">{game.title}</span>
                                    {game.price !== undefined && (
                                        <span className="price">${game.price.toFixed(2)}</span>
                                    )}
                                </div>
                            </Link>
                        ))}
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
                                {blogPosts.map((post) => (
                                    <div className="blog-item" key={post.title}>
                                        <div className="blog-thumb" aria-hidden="true" />
                                        <div className="blog-copy">
                                            <div className="blog-title">{post.title}</div>
                                            <div className="blog-snippet muted">{post.snippet}</div>
                                        </div>
                                        <Link className="text-link" to={post.link}>
                                            Read
                                        </Link>
                                    </div>
                                ))}
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
                                {highlights.map((item) => (
                                    <div className="highlight-card" key={item.title}>
                                        <div className="highlight-media" aria-hidden="true" />
                                        <div className="highlight-body">
                                            <div className="highlight-header">
                                                <span className="badge">{item.badge}</span>
                                                <Link className="text-link" to={item.link}>
                                                    Read more
                                                </Link>
                                            </div>
                                            <div className="highlight-title">{item.title}</div>
                                            <div className="highlight-snippet muted">{item.snippet}</div>
                                        </div>
                                    </div>
                                ))}
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

            <section className="testimonials-section">
                <div className="container">
                    <div className="section-heading">
                        <h2>Loved by players</h2>
                        <p className="muted">Trusted by thousands for fast delivery and curated picks.</p>
                    </div>
                    <div className="testimonials-grid">
                        <div className="rating-card">
                            <div className="stars" aria-label="4.8 out of 5 stars">
                                {[...Array(5)].map((_, idx) => (
                                    <FontAwesomeIcon key={idx} icon={faStar} />
                                ))}
                            </div>
                            <div className="rating-score">4.8/5</div>
                            <div className="rating-helper muted">based on 2,300 reviews</div>
                        </div>

                        <div className="testimonial-cards">
                            {testimonials.map((item) => (
                                <div className="testimonial-card" key={item.name}>
                                    <p className="testimonial-quote">{item.quote}</p>
                                    <div className="testimonial-footer">
                                        <div className="avatar" aria-hidden="true">{item.name.charAt(0)}</div>
                                        <div className="testimonial-meta">
                                            <div className="testimonial-name">{item.name}</div>
                                            <div className="testimonial-role muted">{item.role}</div>
                                        </div>
                                        <span className="badge subtle">{item.badge}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

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
                            <div className={`faq-item ${openFaqIndex === index ? 'open' : ''}`} key={item.question}>
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
