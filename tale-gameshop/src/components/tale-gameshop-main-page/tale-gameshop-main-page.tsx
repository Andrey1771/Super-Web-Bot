import React, {useEffect, useMemo, useState} from "react";
import styles from './tale-gameshop-main-page.module.css';
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
        <div className={`${styles["hero-card"]} ${size === 'large' ? styles["hero-card-large"] : styles["hero-card-small"]}`}>
            <div className={styles["hero-media"]}>
                {game?.imagePath ? (
                    <img alt={game.title} src={`${urlService.apiBaseUrl}/${game.imagePath}`}/>
                ) : (
                    <div className={`${styles["media-placeholder"]} ${styles.skeleton}`} aria-hidden="true" />
                )}
            </div>
            <div className={styles["hero-overlay"]}>
                <span className={styles["hero-title"]}>{game?.title}</span>
                {game?.price !== undefined && (
                    <span className={styles["hero-price"]}>${game.price.toFixed(2)}</span>
                )}
            </div>
        </div>
    );

    const renderHeroSkeleton = (size: 'large' | 'small') => (
        <div
            className={`${styles["hero-card"]} ${size === 'large' ? styles["hero-card-large"] : styles["hero-card-small"]} ${styles["skeleton-card"]}`}
            aria-hidden="true"
        >
            <div className={styles["hero-media"]}>
                <div className={`${styles["media-placeholder"]} ${styles.skeleton}`} />
            </div>
            <div className={styles["hero-overlay"]}>
                <span className={`${styles["skeleton-line"]} ${styles.skeleton}`} />
                <span className={`${styles["skeleton-line"]} ${styles["skeleton-line-short"]} ${styles.skeleton}`} />
            </div>
        </div>
    );

    return (
        <div className={styles["main-page"]}>
            <section className={styles.hero}>
                <div className={`container ${styles["hero-grid"]} ${styles["hero-container"]}`}>
                    <div className={styles["hero-copy"]}>
                        <div className={styles.eyebrow}>PARE GAMES</div>
                        <h1>Discover Your Next Favourite Computer Game</h1>
                        <p className={styles["hero-subtext"]}>
                            A curated marketplace built for PC gamers. Browse premium picks, pay securely, and jump in instantly.
                        </p>
                        <div className={styles["hero-perks"]}>
                            {perks.map((perk) => (
                                <div className={styles["hero-perk"]} key={perk}>
                                    <FontAwesomeIcon icon={faCheckCircle} />
                                    <span>{perk}</span>
                                </div>
                            ))}
                        </div>
                        <div className={styles["hero-actions"]}>
                            <Link to={`/games?filterCategory`} className="btn btn-primary">
                                Shop
                            </Link>
                            <Link to="/about" className="btn btn-outline">
                                Learn more
                            </Link>
                        </div>
                    </div>

                    <div className={styles["hero-showcase"]}>
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

            <section className={styles["featured-section"]}>
                <div className="container">
                    <div className={styles["section-header"]}>
                        <div>
                            <div className={styles.eyebrow}>Featured / Popular</div>
                            <h2>Featured / Popular games</h2>
                        </div>
                        <div className={styles["carousel-actions"]}>
                            <Link to={`/games`} className="icon-button" aria-label="Browse more games">
                                <FontAwesomeIcon icon={faArrowRight} />
                            </Link>
                        </div>
                    </div>

                    <div className={styles["featured-scroller"]}>
                        {isLoading ? (
                            Array.from({length: 6}).map((_, index) => (
                                <div
                                    className={`${styles["featured-card"]} ${styles["skeleton-card"]}`}
                                    key={`featured-skeleton-${index}`}
                                    aria-hidden="true"
                                >
                                    <div className={styles["featured-media"]}>
                                        <div className={`${styles["media-placeholder"]} ${styles.skeleton}`} />
                                    </div>
                                    <div className={styles["featured-meta"]}>
                                        <span className={`${styles["skeleton-line"]} ${styles.skeleton}`} />
                                        <span className={`${styles["skeleton-line"]} ${styles["skeleton-line-short"]} ${styles.skeleton}`} />
                                    </div>
                                </div>
                            ))
                        ) : (
                            featuredGames.map((game) => (
                                <Link
                                    to={`/games?filterCategory=${game.title}`}
                                    className={styles["featured-card"]}
                                    key={game.id || game.title}
                                >
                                    <div className={styles["featured-media"]}>
                                        {game.imagePath ? (
                                            <img alt={game.title} src={`${urlService.apiBaseUrl}/${game.imagePath}`}/>
                                        ) : (
                                            <div className={`${styles["media-placeholder"]} ${styles.skeleton}`} aria-hidden="true" />
                                        )}
                                    </div>
                                    <div className={styles["featured-meta"]}>
                                        <span className={styles["featured-title"]}>{game.title}</span>
                                        {game.price !== undefined && (
                                            <span className={styles["featured-price"]}>${game.price.toFixed(2)}</span>
                                        )}
                                    </div>
                                </Link>
                            ))
                        )}
                    </div>
                </div>
            </section>

            <section className={styles["explore-blog-section"]}>
                <div className="container">
                    <div className={styles["explore-grid"]}>
                        <div className={styles["explore-column"]}>
                            <div className={styles["column-header"]}>
                                <h3>Explore our games</h3>
                                <p className="muted">Genres curated for every kind of player.</p>
                            </div>
                            <div className={styles["genre-grid"]}>
                                {genres.map((genre) => (
                                    <div className={styles["genre-card"]} key={genre.title}>
                                        <div className={styles["genre-icon"]}>
                                            <FontAwesomeIcon icon={genre.icon} />
                                        </div>
                                        <div className={styles["genre-copy"]}>
                                            <div className={styles["genre-title"]}>{genre.title}</div>
                                            <div className={`${styles["genre-description"]} muted`}>{genre.description}</div>
                                        </div>
                                        <Link className={styles["genre-link"]} to={`/games?filterCategory=${genre.title}`}>
                                            View
                                        </Link>
                                    </div>
                                ))}
                            </div>
                            <Link className={`btn btn-outline ${styles["full-width"]}`} to={`/games`}>
                                Browse all genres
                            </Link>
                        </div>

                        <div className={styles["explore-column"]}>
                            <div className={styles["column-header"]}>
                                <h3>Latest blog posts</h3>
                                <p className="muted">Fresh drops from our editorial team.</p>
                            </div>
                            <div className={styles["blog-list"]}>
                                {blogPosts.map((post) => (
                                    <div className={styles["blog-item"]} key={post.title}>
                                        <div className={styles["blog-thumb"]} aria-hidden="true" />
                                        <div className={styles["blog-copy"]}>
                                            <div className={styles["blog-title"]}>{post.title}</div>
                                            <div className={`${styles["blog-snippet"]} muted`}>{post.snippet}</div>
                                        </div>
                                        <Link className={styles["text-link"]} to={post.link}>
                                            Read
                                        </Link>
                                    </div>
                                ))}
                            </div>
                            <Link className="btn btn-ghost" to="/blog">
                                Go to blog
                            </Link>
                        </div>

                        <div className={styles["explore-column"]}>
                            <div className={styles["column-header"]}>
                                <h3>Highlights from blog</h3>
                                <p className="muted">Hand-picked stories worth reading.</p>
                            </div>
                            <div className={styles["highlight-stack"]}>
                                {highlights.map((item) => (
                                    <div className={styles["highlight-card"]} key={item.title}>
                                        <div className={styles["highlight-media"]} aria-hidden="true" />
                                        <div className={styles["highlight-body"]}>
                                            <div className={styles["highlight-header"]}>
                                                <span className={styles["highlight-badge"]}>{item.badge}</span>
                                                <Link className={styles["text-link"]} to={item.link}>
                                                    Read more
                                                </Link>
                                            </div>
                                            <div className={styles["highlight-title"]}>{item.title}</div>
                                            <div className={`${styles["highlight-snippet"]} muted`}>{item.snippet}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className={styles["why-section"]}>
                <div className="container">
                    <div className={styles["section-heading"]}>
                        <h2>Why choose us</h2>
                        <p className="muted">Curated games, secure payments, and delivery in moments.</p>
                    </div>
                    <div className={styles["why-grid"]}>
                        {reasons.map((reason) => (
                            <div className={styles["why-card"]} key={reason.title}>
                                <div className={styles["why-icon"]}>
                                    <FontAwesomeIcon icon={reason.icon} />
                                </div>
                                <div className={styles["why-copy"]}>
                                    <div className={styles["why-title"]}>{reason.title}</div>
                                    <div className={`${styles["why-description"]} muted`}>{reason.description}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className={styles["how-section"]}>
                <div className="container">
                    <div className={styles["section-heading"]}>
                        <h2>How it works</h2>
                        <p className="muted">Three simple steps from browsing to playing.</p>
                    </div>
                    <div className={styles["steps-grid"]}>
                        {steps.map((step, index) => (
                            <div className={styles["step-card"]} key={step.label}>
                                <div className={styles["step-marker"]}>{index + 1}</div>
                                <div className={styles["step-body"]}>
                                    <div className={styles["step-title"]}>{step.label}</div>
                                    <div className={`${styles["step-helper"]} muted`}>{step.helper}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className={`${styles["trust-row"]} muted`}>
                        Refund policy • Verified payments • Instant email delivery
                    </div>
                </div>
            </section>

            <section className={styles["cta-section"]}>
                <div className="container">
                    <div className={styles["cta-card"]}>
                        <div className={styles["cta-copy"]}>
                            <h3>Ready to explore the Store?</h3>
                            <p className="muted">Discover the full catalog and weekly deals.</p>
                        </div>
                        <div className={styles["cta-actions"]}>
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

            <section className={styles["testimonials-section"]}>
                <div className="container">
                    <div className={styles["section-heading"]}>
                        <h2>Loved by players</h2>
                        <p className="muted">Trusted by thousands for fast delivery and curated picks.</p>
                    </div>
                    <div className={styles["testimonials-grid"]}>
                        <div className={styles["rating-card"]}>
                            <div className={styles.stars} aria-label="4.8 out of 5 stars">
                                {[...Array(5)].map((_, idx) => (
                                    <FontAwesomeIcon key={idx} icon={faStar} />
                                ))}
                            </div>
                            <div className={styles["rating-score"]}>4.8/5</div>
                            <div className={`${styles["rating-helper"]} muted`}>based on 2,300 reviews</div>
                        </div>

                        <div className={styles["testimonial-cards"]}>
                            {testimonials.map((item) => (
                                <div className={styles["testimonial-card"]} key={item.name}>
                                    <p className={styles["testimonial-quote"]}>{item.quote}</p>
                                    <div className={styles["testimonial-footer"]}>
                                        <div className={styles.avatar} aria-hidden="true">{item.name.charAt(0)}</div>
                                        <div className={styles["testimonial-meta"]}>
                                            <div className={styles["testimonial-name"]}>{item.name}</div>
                                            <div className={`${styles["testimonial-role"]} muted`}>{item.role}</div>
                                        </div>
                                        <span className={styles["testimonial-badge"]}>{item.badge}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className={styles["trust-section"]}>
                <div className="container">
                    <div className={styles["trust-heading"]}>
                        <h3>Trusted payment & delivery</h3>
                    </div>
                    <div className={styles["trust-items"]}>
                        {trustPoints.map((point) => (
                            <div className={styles["trust-item"]} key={point.title}>
                                <FontAwesomeIcon icon={point.icon} />
                                <span>{point.title}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className={styles["newsletter-section"]}>
                <div className="container">
                    <div className={styles["newsletter-card"]}>
                        <div className={styles["newsletter-copy"]}>
                            <h3>Get weekly deals & rare picks</h3>
                            <p className="muted">No spam. Unsubscribe anytime.</p>
                        </div>
                        <form className={styles["newsletter-form"]} onSubmit={(e) => e.preventDefault()}>
                            <div className={styles["input-row"]}>
                                <div className={styles["input-icon"]}>
                                    <FontAwesomeIcon icon={faEnvelope} />
                                </div>
                                <input type="email" placeholder="Enter your email" required />
                                <button className="btn btn-primary" type="submit">Subscribe</button>
                            </div>
                            <label className={styles["checkbox-row"]}>
                                <input type="checkbox" defaultChecked />
                                <span>Notify me about price drops</span>
                            </label>
                        </form>
                    </div>
                </div>
            </section>

            <section className={styles["faq-section"]}>
                <div className="container">
                    <div className={styles["section-heading"]}>
                        <h3>Quick FAQ</h3>
                        <p className="muted">Answers to common questions about delivery and payments.</p>
                    </div>
                    <div className={styles["faq-list"]}>
                        {faqs.map((item, index) => (
                            <div
                                className={`${styles["faq-item"]} ${openFaqIndex === index ? styles.open : ''}`}
                                key={item.question}
                            >
                                <button className={styles["faq-trigger"]} onClick={() => toggleFaq(index)}>
                                    <span>{item.question}</span>
                                    <FontAwesomeIcon icon={faChevronDown} />
                                </button>
                                {openFaqIndex === index && (
                                    <div className={`${styles["faq-answer"]} muted`}>{item.answer}</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className={styles["store-prefooter"]}>
                <div className="container">
                    <div className={styles["store-prefooter-card"]}>
                        <div className={styles["store-prefooter-copy"]}>
                            <h3>Find your next game today</h3>
                            <p className="muted">Step into the full catalog with weekly deals and curated picks.</p>
                        </div>
                        <div className={styles["store-prefooter-actions"]}>
                            <Link to="/games" className="btn btn-primary">Go to Store</Link>
                            <Link to={`/games?filterCategory`} className="btn btn-outline">Browse genres</Link>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
