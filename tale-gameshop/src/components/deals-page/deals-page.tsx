import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./deals-page.css";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IGameService } from "../../iterfaces/i-game-service";
import type { IUrlService } from "../../iterfaces/i-url-service";
import { Game } from "../../models/game";
import { useCart } from "../../context/cart-context";
import { Product } from "../../reducers/cart-reducer";
import { useSitePreferences, formatMoney } from "../../context/site-preferences";
import { slugify } from "../../utils/slugify";
import SafeGameImage from "../common/SafeGameImage";

interface DealGame {
    game: Game;
    regularPrice: number;
    finalPrice: number;
    percent: number;
}

export default function DealsPage() {
    const [games, setGames] = useState<Game[]>([]);
    const [loading, setLoading] = useState(true);
    const { currency } = useSitePreferences();
    const { dispatch } = useCart();

    const services = useMemo(
        () => ({
            gameService: container.get<IGameService>(IDENTIFIERS.IGameService),
            urlService: container.get<IUrlService>(IDENTIFIERS.IUrlService),
        }),
        []
    );

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const all = await services.gameService.getAllGames();
                if (active) {
                    setGames(Array.isArray(all) ? all : []);
                }
            } catch (error) {
                console.error("Failed to load deals", error);
                if (active) {
                    setGames([]);
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        })();
        return () => {
            active = false;
        };
    }, [services.gameService]);

    const deals = useMemo<DealGame[]>(() => {
        return games
            .map((game) => {
                const regularPrice = Number.isFinite(game.price) ? Number(game.price) : 0;
                const finalPrice = Number.isFinite(game.finalPrice ?? game.price)
                    ? Number(game.finalPrice ?? game.price)
                    : regularPrice;
                const percent = Number(game.discountPercent ?? 0);
                return { game, regularPrice, finalPrice, percent };
            })
            .filter(
                (deal) =>
                    deal.game.discountActive &&
                    deal.percent > 0 &&
                    deal.finalPrice < deal.regularPrice
            )
            .sort((a, b) => b.percent - a.percent);
    }, [games]);

    const bestPercent = deals.length > 0 ? Math.round(deals[0].percent) : 0;

    // Fallback content so the page never feels hollow while no discounts are configured:
    // cheapest titles from the SAME fetched list — zero extra requests.
    const budgetPicks = useMemo(() => {
        if (deals.length > 0) {
            return [];
        }
        const priced = games
            .map((game) => ({
                game,
                price: Number.isFinite(game.finalPrice ?? game.price)
                    ? Number(game.finalPrice ?? game.price)
                    : Number(game.price) || 0,
            }))
            .filter((entry) => entry.price > 0)
            .sort((a, b) => a.price - b.price);
        const under20 = priced.filter((entry) => entry.price <= 20);
        return (under20.length >= 4 ? under20 : priced).slice(0, 8);
    }, [deals.length, games]);

    const handleAddToCart = (game: Game, price: number) => {
        dispatch({
            type: "ADD_TO_CART",
            payload: {
                gameId: game.id ?? "",
                name: game.name,
                price,
                quantity: 1,
                image: game.imagePath,
            } as Product,
        });
    };

    const gameHref = (game: Game) =>
        `/games/${game.slug ? slugify(game.slug) : slugify(game.title || game.name)}`;

    return (
        <div className="deals-page">
            <section className="deals-hero">
                <div className="container deals-hero-inner">
                    <span className="deals-eyebrow">Limited-time offers</span>
                    <h1>Deals &amp; discounts</h1>
                    <p className="deals-hero-subtext">
                        Hand-picked price drops on curated PC games — instant key delivery, secure checkout.
                        Prices update as new offers go live.
                    </p>
                    {/* Stats only make sense when there ARE live deals — "0 / -0%" reads as broken. */}
                    {(loading || deals.length > 0) && (
                        <div className="deals-hero-stats">
                            <div className="deals-stat">
                                <span className="deals-stat-value">{loading ? "—" : deals.length}</span>
                                <span className="deals-stat-label">games on sale</span>
                            </div>
                            <div className="deals-stat">
                                <span className="deals-stat-value">{loading ? "—" : `-${bestPercent}%`}</span>
                                <span className="deals-stat-label">biggest discount</span>
                            </div>
                            <div className="deals-stat">
                                <span className="deals-stat-value">24/7</span>
                                <span className="deals-stat-label">delivery &amp; support</span>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <section className="container deals-body">
                {loading ? (
                    <div className="deals-grid">
                        {Array.from({ length: 8 }).map((_, index) => (
                            <div className="deal-card deal-card-skeleton" key={`deal-skeleton-${index}`}>
                                <div className="deal-media skeleton" />
                                <div className="deal-body">
                                    <div className="skeleton skeleton-line" />
                                    <div className="skeleton skeleton-line skeleton-line-short" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : deals.length === 0 ? (
                    <>
                        <div className="deals-empty">
                            <h2>Deals are taking a short break</h2>
                            <p className="muted">
                                Discounts rotate regularly and new offers land often — check back soon or grab a
                                budget-friendly pick below in the meantime.
                            </p>
                            <Link to="/games" className="btn btn-primary">
                                Browse the catalog
                            </Link>
                        </div>

                        {budgetPicks.length > 0 && (
                            <>
                                <div className="deals-toolbar">
                                    <h2>Budget picks in the meantime</h2>
                                    <span className="deals-count muted">
                                        {budgetPicks.length} {budgetPicks.length === 1 ? "game" : "games"}
                                    </span>
                                </div>
                                <div className="deals-grid">
                                    {budgetPicks.map(({ game, price }, index) => (
                                        <article className="deal-card" key={`${game.id ?? index}`}>
                                            <div className="deal-media">
                                                <Link
                                                    to={gameHref(game)}
                                                    className="deal-media-link"
                                                    aria-label={`Open ${game.title}`}
                                                />
                                                <SafeGameImage
                                                    gameTitle={game.title}
                                                    src={game.imagePath}
                                                    baseUrl={services.urlService.apiBaseUrl}
                                                />
                                            </div>
                                            <div className="deal-body">
                                                <h3 className="deal-title">
                                                    <Link to={gameHref(game)}>{game.title}</Link>
                                                </h3>
                                                <div className="deal-prices">
                                                    <span className="deal-price-new">{formatMoney(price, currency)}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="btn btn-primary deal-cta"
                                                    onClick={() => handleAddToCart(game, price)}
                                                >
                                                    Add to cart
                                                </button>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <>
                        <div className="deals-toolbar">
                            <h2>On sale now</h2>
                            <span className="deals-count muted">
                                {deals.length} {deals.length === 1 ? "game" : "games"}
                            </span>
                        </div>
                        <div className="deals-grid">
                            {deals.map(({ game, regularPrice, finalPrice, percent }, index) => (
                                <article className="deal-card" key={`${game.id ?? index}`}>
                                    <div className="deal-media">
                                        <Link
                                            to={gameHref(game)}
                                            className="deal-media-link"
                                            aria-label={`Open ${game.title}`}
                                        />
                                        <SafeGameImage
                                            gameTitle={game.title}
                                            src={game.imagePath}
                                            baseUrl={services.urlService.apiBaseUrl}
                                        />
                                        <span className="deal-badge">-{Math.round(percent)}%</span>
                                    </div>
                                    <div className="deal-body">
                                        <h3 className="deal-title">
                                            <Link to={gameHref(game)}>{game.title}</Link>
                                        </h3>
                                        <div className="deal-prices">
                                            <span className="deal-price-old">{formatMoney(regularPrice, currency)}</span>
                                            <span className="deal-price-new">{formatMoney(finalPrice, currency)}</span>
                                        </div>
                                        <button
                                            type="button"
                                            className="btn btn-primary deal-cta"
                                            onClick={() => handleAddToCart(game, finalPrice)}
                                        >
                                            Add to cart
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </>
                )}

                <div className="deals-footer-cta">
                    <div>
                        <h3>Looking for something specific?</h3>
                        <p className="muted">Explore the full catalog with filters for genre, platform and price.</p>
                    </div>
                    <Link to="/games" className="btn btn-outline">
                        Go to Store
                    </Link>
                </div>
            </section>
        </div>
    );
}
