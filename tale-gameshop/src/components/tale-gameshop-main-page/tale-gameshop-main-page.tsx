import React, {useEffect, useMemo, useState} from "react";
import './tale-gameshop-main-page.css'
import '../../font-awesome.ts';
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faArrowRight,
    faBolt,
    faCheckCircle,
    faChessKnight,
    faHatWizard,
    faLeaf,
    faPuzzlePiece,
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

                    <div className="bridge">
                        <div className="divider" />
                        <div className="bridge-label muted">Next: Why choose us</div>
                    </div>
                </div>
            </section>
        </div>
    );
}
