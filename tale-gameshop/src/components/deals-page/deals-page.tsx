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
import { subscribeNewsletter } from "../../api/newsletterApi";
import {
    rememberNewsletterSubscription,
    useKnownNewsletterSubscription,
} from "../../hooks/use-newsletter-subscribed";
import { slugify } from "../../utils/slugify";
import SafeGameImage from "../common/SafeGameImage";
import CountUp from "../effects/CountUp";

interface DealGame {
    game: Game;
    regularPrice: number;
    finalPrice: number;
    percent: number;
}

// Спящий ценник — иллюстрация пустого состояния, когда активных скидок нет.
const SleepingTagArt: React.FC = () => (
    <svg viewBox="0 0 220 180" width="100%" aria-hidden="true" focusable="false">
        <g transform="rotate(-10 100 100)">
            <path
                d="M44 58h100a14 14 0 0 1 14 14v48a14 14 0 0 1-14 14H44L16 106a8 8 0 0 1 0-12z"
                fill="#ece5ff"
                stroke="#c4b5fd"
                strokeWidth="2.5"
                strokeLinejoin="round"
            />
            <circle cx="44" cy="100" r="6" fill="#ffffff" stroke="#c4b5fd" strokeWidth="2.5" />
            <path d="M84 92q6 6 12 0" stroke="#7c6bb0" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M116 92q6 6 12 0" stroke="#7c6bb0" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M96 112q10 8 20 0" stroke="#7c6bb0" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
        <text x="152" y="48" fontSize="28" fontWeight="800" fill="#a78bfa" fontFamily="inherit">Z</text>
        <text x="172" y="30" fontSize="20" fontWeight="800" fill="#c4b5fd" fontFamily="inherit">z</text>
        <text x="188" y="17" fontSize="14" fontWeight="800" fill="#ddd3ff" fontFamily="inherit">z</text>
        <path d="M28 26l2.4 6.2 6.2 2.4-6.2 2.4-2.4 6.2-2.4-6.2-6.2-2.4 6.2-2.4z" fill="#c4b5fd" />
        <path d="M198 122l2 5.2 5.2 2-5.2 2-2 5.2-2-5.2-5.2-2 5.2-2z" fill="#ddd3ff" />
    </svg>
);

// Хвостовая CTA-карточка добивает ряд грида, чтобы он не обрывался пустотой.
const CatalogCtaCard: React.FC = () => (
    <Link to="/games" className="deal-card deal-card-cta">
        <i className="fx-texture" aria-hidden="true"></i>
        <span className="deal-card-cta-title">See the full catalog</span>
        <span className="deal-card-cta-desc">Filters for genre, platform and price.</span>
        <span className="deal-card-cta-arrow" aria-hidden="true">→</span>
    </Link>
);

export default function DealsPage() {
    const [games, setGames] = useState<Game[]>([]);
    const [loading, setLoading] = useState(true);
    const { currency } = useSitePreferences();
    const { dispatch } = useCart();

    const [notifyEmail, setNotifyEmail] = useState("");
    const [notifyStatus, setNotifyStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
    // "pending" — гостю ушло письмо-подтверждение; "confirmed" — владелец аккаунта, подписан сразу.
    const [notifyResult, setNotifyResult] = useState<"pending" | "confirmed">("pending");
    const knownSubscription = useKnownNewsletterSubscription();

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
            // Невышедшие не продаются — в бюджетную подборку не попадают.
            .filter((game) => !game.isComingSoon)
            .map((game) => ({
                game,
                price: Number.isFinite(game.finalPrice ?? game.price)
                    ? Number(game.finalPrice ?? game.price)
                    : Number(game.price) || 0,
            }))
            .filter((entry) => entry.price > 0)
            .sort((a, b) => a.price - b.price);
        const under20 = priced.filter((entry) => entry.price <= 20);
        return (under20.length >= 4 ? under20 : priced).slice(0, 7);
    }, [deals.length, games]);

    const handleAddToCart = (game: Game, price: number) => {
        if (game.isComingSoon) {
            return;
        }
        dispatch({
            type: "ADD_TO_CART",
            payload: {
                gameId: game.id ?? "",
                name: game.title ?? game.name,
                price,
                quantity: 1,
                image: game.imagePath,
            } as Product,
        });
    };

    const handleNotifySubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const email = notifyEmail.trim();
        if (!email || notifyStatus === "sending") {
            return;
        }
        setNotifyStatus("sending");
        try {
            const status = await subscribeNewsletter(email, "deals");
            rememberNewsletterSubscription(status);
            setNotifyResult(status === "confirmed" ? "confirmed" : "pending");
            setNotifyStatus("done");
        } catch (error) {
            console.error("Failed to subscribe", error);
            setNotifyStatus("error");
        }
    };

    const gameHref = (game: Game) =>
        `/games/${game.slug ? slugify(game.slug) : slugify(game.title || game.name)}`;

    return (
        <div className="deals-page">
            <section className="deals-hero">
                <i className="fx-texture" aria-hidden="true"></i>
                <i className="fx-orb deals-orb-1" aria-hidden="true"></i>
                <i className="fx-orb is-magenta deals-orb-2" aria-hidden="true"></i>
                <span className="deals-hero-glyph fx-float" aria-hidden="true">%</span>
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
                                <span className="deals-stat-value">
                                    {loading ? "—" : <CountUp value={deals.length} />}
                                </span>
                                <span className="deals-stat-label">games on sale</span>
                            </div>
                            <div className="deals-stat">
                                <span className="deals-stat-value">
                                    {loading ? "—" : <CountUp value={bestPercent} prefix="-" suffix="%" />}
                                </span>
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
                        <div className="deals-empty-panel reveal">
                            <div className="deals-empty-art">
                                <SleepingTagArt />
                            </div>
                            <div className="deals-empty-copy">
                                <h2>Deals are taking a short break</h2>
                                <p className="muted">
                                    Discounts rotate regularly and new offers land often. Leave your email — we&rsquo;ll
                                    send one message when fresh deals go live. No spam.
                                </p>
                                {notifyStatus === "done" ? (
                                    <p className="deals-notify-done">
                                        {notifyResult === "confirmed"
                                            ? "✓ You're on the list — we'll email you when new deals arrive."
                                            : "✓ Almost there — check your inbox and confirm the subscription."}
                                    </p>
                                ) : knownSubscription ? (
                                    // Уже подписан (с этого устройства или через аккаунт) — форму не дублируем.
                                    <p className="deals-notify-done">
                                        {knownSubscription === "confirmed"
                                            ? "✓ You're on the list — we'll email you when new deals arrive."
                                            : "✓ Almost there — confirm the link we sent to your inbox."}
                                    </p>
                                ) : (
                                    <form className="deals-notify" onSubmit={handleNotifySubmit}>
                                        <input
                                            type="email"
                                            required
                                            placeholder="you@email.com"
                                            aria-label="Email for deal alerts"
                                            value={notifyEmail}
                                            onChange={(event) => {
                                                setNotifyEmail(event.target.value);
                                                if (notifyStatus === "error") {
                                                    setNotifyStatus("idle");
                                                }
                                            }}
                                        />
                                        <button
                                            type="submit"
                                            className="btn btn-primary"
                                            disabled={notifyStatus === "sending"}
                                        >
                                            {notifyStatus === "sending" ? "Saving…" : "Notify me"}
                                        </button>
                                    </form>
                                )}
                                {notifyStatus === "error" && (
                                    <p className="deals-notify-error">
                                        Couldn&rsquo;t save your email right now — please try again in a minute.
                                    </p>
                                )}
                                <Link to="/games" className="deals-empty-browse">
                                    Or browse the full catalog →
                                </Link>
                            </div>
                        </div>

                        {budgetPicks.length > 0 && (
                            <>
                                <div className="deals-toolbar reveal">
                                    <h2>Budget picks in the meantime</h2>
                                    <span className="deals-count muted">
                                        {budgetPicks.length} {budgetPicks.length === 1 ? "game" : "games"}
                                    </span>
                                </div>
                                <div className="deals-grid reveal">
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
                                                {price <= 20 && (
                                                    <span className="deal-badge deal-badge-soft">Under $20</span>
                                                )}
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
                                    <CatalogCtaCard />
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <>
                        <div className="deals-toolbar reveal">
                            <h2>On sale now</h2>
                            <span className="deals-count muted">
                                {deals.length} {deals.length === 1 ? "game" : "games"}
                            </span>
                        </div>
                        <div className="deals-grid reveal">
                            {deals.map(({ game, regularPrice, finalPrice, percent }, index) => (
                                <article className="deal-card" key={`${game.id ?? index}`}>
                                    <div className="deal-media">
                                        <Link
                                            to={gameHref(game)}
                                            className="deal-media-link"
                                            aria-label={`Open game ${game.title}`}
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
                            <CatalogCtaCard />
                        </div>
                    </>
                )}

                <div className="deals-footer-cta reveal">
                    <i className="fx-texture is-light" aria-hidden="true"></i>
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
