import React, {useEffect, useMemo, useState} from "react";
import './tale-gameshop-main-page.css'
import '../../font-awesome.ts';
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faArrowRight, faCheckCircle} from "@fortawesome/free-solid-svg-icons";
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
        </div>
    );
}
