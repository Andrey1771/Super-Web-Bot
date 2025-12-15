import React, {useEffect, useMemo, useState} from "react";
import './tale-gameshop-main-page.css';
import container from "../../inversify.config";
import type {IApiClient} from "../../iterfaces/i-api-client";
import IDENTIFIERS from "../../constants/identifiers";
import {Game} from "../../models/game";
import {Link} from "react-router-dom";
import {useKeycloak} from "@react-keycloak/web";
import type {IKeycloakAuthService} from "../../iterfaces/i-keycloak-auth-service";
import {IUrlService} from "../../iterfaces/i-url-service";
import placeholderOne from "../../assets/images/placeholder-1.svg";
import placeholderTwo from "../../assets/images/placeholder-2.svg";
import placeholderThree from "../../assets/images/placeholder-3.svg";

const TaleGameshopMainPage: React.FC = () => {
    const [games, setGames] = useState<Game[]>([]);
    const {keycloak} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);
    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    const placeholders = useMemo(() => [placeholderOne, placeholderTwo, placeholderThree], []);

    useEffect(() => {
        fetchLatestGame();
    }, []);

    const fetchLatestGame = async () => {
        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            const response = await apiClient.api.get('/api/game');
            const items: Game[] = response.data;
            setGames(items || []);
        } catch (err) {
            setGames([]);
        }
    };

    const register = async () => {
        try {
            await keycloakAuthService.registerWithRedirect(keycloak, window.location.href);
        } catch (error) {
            console.error('Ошибка инициализации приложения:', error);
        }
    };

    const popularGames = games.slice(0, 8);

    const fallbackImage = (index: number) => placeholders[index % placeholders.length];

    return (
        <div className="container home-page">
            <section className="hero">
                <div>
                    <h1>Discover Your Next Favourite Game</h1>
                    <p>Hand-picked PC titles, instant delivery, and secure checkout in one modern storefront.</p>
                    <div className="hero-actions">
                        <Link to="/games" className="btn btn-primary">Shop</Link>
                        <Link to="/games" className="btn btn-outline">Browse games</Link>
                    </div>
                </div>
                <div className="hero-card card">
                    <p className="section-subtitle">Curated releases updated weekly</p>
                    <div className="hero-highlight">
                        <div>
                            <h3>Trusted payments</h3>
                            <p>Encrypted checkout with instant confirmation.</p>
                        </div>
                        <div>
                            <h3>Fast delivery</h3>
                            <p>Game keys and downloads sent to your library right away.</p>
                        </div>
                    </div>
                    {!keycloak.authenticated && (
                        <button className="btn btn-primary" onClick={register}>Create account</button>
                    )}
                </div>
            </section>

            <section className="card benefits">
                <div className="benefit">
                    <div className="benefit-icon">🔒</div>
                    <div>
                        <h3>Secure Payments</h3>
                        <p className="section-subtitle">PCI-compliant checkout with buyer protection on every order.</p>
                    </div>
                </div>
                <div className="benefit">
                    <div className="benefit-icon">⚡</div>
                    <div>
                        <h3>Fast Support</h3>
                        <p className="section-subtitle">Reach our support team in minutes via chat or email.</p>
                    </div>
                </div>
                <div className="benefit">
                    <div className="benefit-icon">🎮</div>
                    <div>
                        <h3>Curated Game Catalog</h3>
                        <p className="section-subtitle">A focused library of great PC games without the clutter.</p>
                    </div>
                </div>
            </section>

            <section className="card popular">
                <div className="popular-header">
                    <div>
                        <h2 className="section-title">Popular games</h2>
                        <p className="section-subtitle">A quick peek at what players are enjoying right now.</p>
                    </div>
                    <Link to="/games" className="btn btn-outline">View full store</Link>
                </div>
                <div className="popular-grid">
                    {popularGames.map((game, index) => (
                        <div className="card popular-card" key={game.id ?? index}>
                            <div className="popular-image">
                                <img
                                    src={`${urlService.apiBaseUrl}/${game.imagePath}`}
                                    alt={game.title}
                                    onError={(event) => event.currentTarget.src = fallbackImage(index)}
                                />
                            </div>
                            <div className="popular-body">
                                <h3>{game.title}</h3>
                                <p className="section-subtitle">${game.price}</p>
                                <Link to="/games" className="btn btn-primary">Add to cart</Link>
                            </div>
                        </div>
                    ))}
                    {popularGames.length === 0 && (
                        <div className="popular-empty">No games found yet. Check back soon!</div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default TaleGameshopMainPage;
