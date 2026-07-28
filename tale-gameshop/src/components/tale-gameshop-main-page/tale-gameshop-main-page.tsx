import React, {
    useEffect,
    useRef,
    useMemo,
    useState
} from "react";
import "./tale-gameshop-main-page.css";
import "../../font-awesome.ts";
import {
    FontAwesomeIcon
} from "@fortawesome/react-fontawesome";
import {
    faArrowRight,
    faBolt,
    faCheckCircle,
    faChessKnight,
    faChevronDown,
    faEnvelope,
    faFeather,
    faHatWizard,
    faLeaf,
    faPuzzlePiece,
    faUsers
} from "@fortawesome/free-solid-svg-icons";
import container from "../../inversify.config";
import type {
    IApiClient
} from "../../iterfaces/i-api-client";
import type {
    IBlogService
} from "../../iterfaces/i-blog-service";
import IDENTIFIERS from "../../constants/identifiers";
import {
    Game
} from "../../models/game";
import {
    Link
} from "react-router-dom";
import {
    IUrlService
} from "../../iterfaces/i-url-service";
import SafeGameImage from "../common/SafeGameImage";
import TestimonialsCarousel from "../testimonials/TestimonialsCarousel";
import FeaturedStorefrontSection from "../featured-storefront/FeaturedStorefrontSection";
import ProductCard from "../product-card/ProductCard";
import type {
    BlogListItem
} from "../../types/blog";
import { slugify } from "../../utils/slugify";
import { subscribeNewsletter } from "../../api/newsletterApi";
import {
    rememberNewsletterSubscription,
    useKnownNewsletterSubscription,
} from "../../hooks/use-newsletter-subscribed";

// Мерчандайзинг-рельса: горизонтальный ряд карточек под конкретную мотивацию покупки
// (скидки / новинки / ценовая корзина). Товар-first — как у настоящих магазинов ключей.
const MerchRail: React.FC<{ title: string; subtitle: string; to: string; items: Game[] }> = ({
    title,
    subtitle,
    to,
    items,
}) => {
    if (items.length === 0) {
        return null;
    }
    return (
        <div className="merch-rail-block" style={{ marginBottom: 34 }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: 16,
                    marginBottom: 14,
                }}
            >
                <div>
                    <h2 style={{ margin: 0 }}>{title}</h2>
                    <p className="muted" style={{ margin: "4px 0 0" }}>{subtitle}</p>
                </div>
                <Link className="btn btn-ghost" to={to} style={{ whiteSpace: "nowrap" }}>
                    View all →
                </Link>
            </div>
            <div
                style={{
                    display: "flex",
                    gap: 16,
                    overflowX: "auto",
                    paddingBottom: 10,
                    scrollSnapType: "x proximity",
                }}
            >
                {items.map((game) => (
                    <div key={game.id} style={{ flex: "0 0 210px", scrollSnapAlign: "start" }}>
                        <ProductCard game={game} />
                    </div>
                ))}
            </div>
        </div>
    );
};

// «Лидеры продаж» нумерованным списком — модуль ДРУГОЙ формы, чтобы главная не была
// стопкой одинаковых рельс. Как у магазинов ключей: ранг + мини-обложка + цена.
const TopSellers: React.FC<{ items: Game[]; baseUrl?: string }> = ({ items, baseUrl }) => {
    if (items.length === 0) {
        return null;
    }
    return (
        <div style={{ marginBottom: 34 }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: 16,
                    marginBottom: 14,
                }}
            >
                <div>
                    <h2 style={{ margin: 0 }}>Top sellers</h2>
                    <p className="muted" style={{ margin: "4px 0 0" }}>Most popular this week</p>
                </div>
                <Link className="btn btn-ghost" to="/games" style={{ whiteSpace: "nowrap" }}>
                    View all →
                </Link>
            </div>
            <div
                style={{
                    display: "grid",
                    gap: "10px 24px",
                    gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))",
                }}
            >
                {items.map((game, index) => {
                    const gameSlug = game.slug ? slugify(game.slug) : slugify(game.title || game.name);
                    const regularPrice = Number(game.price);
                    const finalPrice = Number(game.finalPrice ?? game.price);
                    const hasDiscount = Boolean(
                        game.discountActive && (game.discountPercent ?? 0) > 0 && finalPrice < regularPrice
                    );
                    return (
                        <Link
                            key={game.id}
                            to={`/games/${gameSlug}`}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 14,
                                padding: "10px 14px",
                                borderRadius: 14,
                                background: "rgba(255,255,255,0.78)",
                                border: "1px solid #ece8ff",
                            }}
                        >
                            <span style={{ width: 30, textAlign: "center", fontWeight: 800, fontSize: 18, color: "#b9aee6" }}>
                                {String(index + 1).padStart(2, "0")}
                            </span>
                            <div style={{ width: 58, height: 58, borderRadius: 10, overflow: "hidden", flex: "0 0 auto" }}>
                                <SafeGameImage
                                    gameTitle={game.title}
                                    src={game.imagePath}
                                    baseUrl={baseUrl}
                                    className="h-full w-full object-cover"
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                    style={{
                                        fontWeight: 700,
                                        color: "#2c2354",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {game.title}
                                </div>
                                <div className="muted" style={{ fontSize: 12 }}>{game.genres?.[0] ?? ""}</div>
                            </div>
                            <div style={{ textAlign: "right", flex: "0 0 auto" }}>
                                {hasDiscount && (
                                    <div style={{ fontSize: 11, color: "#9b92c4", textDecoration: "line-through" }}>
                                        ${regularPrice.toFixed(2)}
                                    </div>
                                )}
                                <div style={{ fontWeight: 800, color: hasDiscount ? "#6b3ff2" : "#2c2354" }}>
                                    ${finalPrice.toFixed(2)}
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
};

const genres = [
    { title: "Action", description: "High-impact firefights and fast pacing.", icon: faBolt },
    { title: "Puzzle", description: "Brain-teasing challenges to unwind.", icon: faPuzzlePiece },
    { title: "RPG", description: "Deep stories with character growth.", icon: faHatWizard },
    { title: "Strategy", description: "Command, conquer, and outthink.", icon: faChessKnight },
    { title: "Indie", description: "Curated gems from small teams.", icon: faLeaf },
    { title: "Co-op", description: "Jump in together and beat the odds.", icon: faUsers }
];

const reasons = [
    { title: "Secure payments", description: "Protected checkout with trusted partners.", icon: faCheckCircle },
    { title: "Instant delivery", description: "Receive your key moments after purchase.", icon: faBolt },
    { title: "Curated picks", description: "Hand-selected games for every mood.", icon: faHatWizard },
    { title: "Friendly support", description: "Here to help with installs and access.", icon: faUsers }
];

const testimonials = [
    { quote: "Instant delivery and great picks. Every purchase has been smooth and fast.", name: "Alex P.", role: "Verified buyer", badge: "Verified purchase" },
    { quote: "Love the curated lists—found hidden gems I never would have tried.", name: "Maria K.", role: "Longtime customer", badge: "Verified purchase" },
    { quote: "Checkout feels secure and the keys arrive immediately. Support is friendly too.", name: "Samir L.", role: "Verified buyer", badge: "Verified purchase" }
];

const faqs = [
    { question: "How do I receive my key?", answer: "Keys are delivered instantly to your email and visible in your account after checkout." },
    { question: "What payment methods do you support?", answer: "We support major cards and verified processors for secure payments." },
    { question: "Can I request a refund?", answer: "Yes. If you experience an issue with your key or access, reach out and we will help." },
    { question: "Is the delivery instant?", answer: "Delivery is typically instant. Most purchases reach your inbox within seconds." },
    { question: "Do you support EN/RU?", answer: "We provide support in EN and RU, and the catalog lists language availability per game." }
];

const blogFallbackCover = "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=800&q=80";

export default function TaleGameshopMainPage() {
    const [games, setGames] = useState < Game[] > ([]);
    const [blogPosts, setBlogPosts] = useState < BlogListItem[] > ([]);
    const [blogLoading, setBlogLoading] = useState(true);
    const [openFaqIndex, setOpenFaqIndex] = useState(0);
    const [heroIndex, setHeroIndex] = useState(0);
    const [heroDirection, setHeroDirection] = useState<"next" | "prev">("next");
    const [isHeroAnimating, setIsHeroAnimating] = useState(false);
    const [activeHero, setActiveHero] = useState<Game | null>(null);
    const [previousHero, setPreviousHero] = useState<Game | null>(null);
    const [newsletterEmail, setNewsletterEmail] = useState("");
    const [newsletterStatus, setNewsletterStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
    // "pending" — гостю ушло письмо-подтверждение; "confirmed" — владелец аккаунта, подписан сразу.
    const [newsletterResult, setNewsletterResult] = useState<"pending" | "confirmed">("pending");
    const knownSubscription = useKnownNewsletterSubscription();
    const activeHeroRef = useRef<Game | null>(null);
    const urlService = container.get < IUrlService > (IDENTIFIERS.IUrlService);
    useEffect(() => {
        fetchGames();
    }, []);
    useEffect(() => {
        fetchBlogPosts();
    }, []);
    const fetchGames = async () => {
        try {
            const apiClient = container.get < IApiClient > (IDENTIFIERS.IApiClient);
            const response = await apiClient.api.get("/api/game");
            const items: Game[] = response.data;
            if (!items || items.length === 0) {
                throw new Error("No games found");
            }
            setGames(items);
        } catch (err) {
            //
        }
    };

    const fetchBlogPosts = async () => {
        try {
            setBlogLoading(true);
            const blogService = container.get<IBlogService>(IDENTIFIERS.IBlogService);
            const response = await blogService.getPosts({ page: 1, pageSize: 5 });
            setBlogPosts(response.items);
        } catch (err) {
            console.error(err);
            setBlogPosts([]);
        } finally {
            setBlogLoading(false);
        }
    };

    const heroGames = useMemo(() => {
        return [...games].sort((a, b) => {
            const dateA = Date.parse(a.releaseDate || "");
            const dateB = Date.parse(b.releaseDate || "");
            return (Number.isNaN(dateB) ? 0 : dateB) - (Number.isNaN(dateA) ? 0 : dateA);
        });
    }, [games]);

    useEffect(() => {
        if (heroGames.length === 0) {
            setHeroIndex(0);
            return;
        }

        setHeroIndex((prev) => (prev >= heroGames.length ? 0 : prev));
    }, [heroGames.length]);

    useEffect(() => {
        if (heroGames.length <= 1) {
            return;
        }

        const intervalId = window.setInterval(() => {
            setHeroDirection("next");
            setHeroIndex((prev) => (prev + 1) % heroGames.length);
        }, 6500);

        return () => window.clearInterval(intervalId);
    }, [heroGames.length]);

    const heroPrimary = heroGames[heroIndex] ?? null;

    useEffect(() => {
        if (!heroPrimary) {
            setActiveHero(null);
            setPreviousHero(null);
            setIsHeroAnimating(false);
            activeHeroRef.current = null;
            return;
        }

        const prevHero = activeHeroRef.current;
        if (prevHero && prevHero.id !== heroPrimary.id) {
            setPreviousHero(prevHero);
        } else {
            setPreviousHero(null);
        }

        setActiveHero(heroPrimary);
        activeHeroRef.current = heroPrimary;
        setIsHeroAnimating(true);
        const timeoutId = window.setTimeout(() => {
            setIsHeroAnimating(false);
            setPreviousHero(null);
        }, 500);
        return () => window.clearTimeout(timeoutId);
    }, [heroPrimary]);

    const getGameHref = (game: Game) => {
        const fallbackSlug = slugify(game.slug?.trim() || game.title || game.name || "game");
        return `/games/${fallbackSlug}`;
    };

    const getHeroPrice = (game: Game) => {
        if (Number.isFinite(game.finalPrice ?? NaN)) {
            return Number(game.finalPrice);
        }
        return Number.isFinite(game.price) ? Number(game.price) : 0;
    };

    const formatHeroPrice = (price: number) => `$${price.toFixed(2)}`;

    const goToNextHero = () => {
        if (heroGames.length <= 1) {
            return;
        }
        setHeroDirection("next");
        setHeroIndex((prev) => (prev + 1) % heroGames.length);
    };

    const goToPrevHero = () => {
        if (heroGames.length <= 1) {
            return;
        }
        setHeroDirection("prev");
        setHeroIndex((prev) => (prev - 1 + heroGames.length) % heroGames.length);
    };

    const isLoading = games.length === 0;
    const perks = ["Secure payments", "Instant delivery", "Curated picks"];
    const featuredBlogPosts = useMemo(() => blogPosts.slice(0, 3), [blogPosts]);

    // Подборки для мерчандайзинг-рельс на главной (товар-first).
    const bestDeals = useMemo(
        () =>
            games
                .filter((game) => game.discountActive && (game.discountPercent ?? 0) > 0)
                .sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0))
                .slice(0, 10),
        [games]
    );
    const newReleases = useMemo(
        () =>
            [...games]
                .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime())
                .slice(0, 10),
        [games]
    );
    const under20 = useMemo(
        () => games.filter((game) => Number(game.finalPrice ?? game.price) <= 20).slice(0, 10),
        [games]
    );
    const topSellers = useMemo(
        () =>
            [...games]
                .sort((a, b) => (a.featuredStorefrontPriority ?? 9999) - (b.featuredStorefrontPriority ?? 9999))
                .slice(0, 8),
        [games]
    );

    const toggleFaq = (index: number) => {
        setOpenFaqIndex((prev) => (prev === index ? -1 : index));
    };

    const handleNewsletterSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const email = newsletterEmail.trim();
        if (!email || newsletterStatus === "sending") {
            return;
        }
        setNewsletterStatus("sending");
        try {
            const status = await subscribeNewsletter(email, "homepage");
            rememberNewsletterSubscription(status);
            setNewsletterResult(status === "confirmed" ? "confirmed" : "pending");
            setNewsletterStatus("done");
        } catch (error) {
            console.error("Failed to subscribe", error);
            setNewsletterStatus("error");
        }
    };

    const renderHeroSlide = (game: Game, interactive = true, layerClassName = "") => {
        const href = getGameHref(game);
        const price = formatHeroPrice(getHeroPrice(game));
        const rootClassName = ["hero-carousel hero-card", layerClassName].filter(Boolean).join(" ");
        const linkClassName = [
            "hero-carousel-link",
            interactive ? "hero-card-link" : "hero-carousel-link-passive"
        ].join(" ");

        return (
            <div className={rootClassName}>
                <Link
                    to={href}
                    className={linkClassName}
                    aria-label={`Open game ${game.title}`}
                    tabIndex={interactive ? 0 : -1}
                    aria-hidden={!interactive}
                >
                    <div className="hero-carousel-track">
                        <div className="hero-media">
                        <SafeGameImage gameTitle={game.title} src={game.imagePath} baseUrl={urlService.apiBaseUrl} />
                        </div>
                    </div>
                    <div className="hero-overlay hero-overlay-large">
                        <span className="hero-title hero-title-large">{game.title}</span>
                        <span className="hero-price">{price}</span>
                    </div>
                </Link>

                {interactive && heroGames.length > 1 && (
                    <>
                        <button
                            type="button"
                            className="hero-carousel-hotspot hero-carousel-hotspot-prev"
                            onClick={goToPrevHero}
                            aria-label="Previous game"
                        >
                            <span aria-hidden="true">‹</span>
                        </button>
                        <button
                            type="button"
                            className="hero-carousel-hotspot hero-carousel-hotspot-next"
                            onClick={goToNextHero}
                            aria-label="Next game"
                        >
                            <span aria-hidden="true">›</span>
                        </button>
                    </>
                )}
            </div>
        );
    };

const renderHeroSkeleton = () => (
        <div className="hero-carousel hero-card skeleton-card" aria-hidden="true">
            <div className="hero-carousel-track">
                <div className="hero-media">
                    <div className="media-placeholder skeleton" />
                </div>
            </div>
            <div className="hero-overlay hero-overlay-large">
                <span className="skeleton-line skeleton" />
                <span className="skeleton-line skeleton-line-short skeleton" />
            </div>
        </div>
    );

    return (
        <div className="main-page">
            <section className="hero">
                <i className="fx-texture" aria-hidden="true"></i>
                <i className="fx-orb hero-orb-1" aria-hidden="true"></i>
                <i className="fx-orb is-magenta hero-orb-2" aria-hidden="true"></i>
                <div className="container hero-grid hero-container">
                    <div className="hero-copy">
                        <div className="eyebrow">Tale Shop · PC games</div>
                        <h1>Discover your next favourite game</h1>
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
                            <Link to="/games" className="btn btn-primary">Shop the catalog</Link>
                            <Link to="/about" className="btn btn-outline">Learn more</Link>
                        </div>
                    </div>

                    <div className="hero-showcase">
                        {isLoading ? (
                            renderHeroSkeleton()
                        ) : heroPrimary ? (
                            <div className="hero-carousel-module">
                                <div
                                    className={[
                                        "hero-carousel-stage",
                                        isHeroAnimating ? "hero-carousel-stage-is-animating" : "",
                                        isHeroAnimating ? `hero-carousel-stage-${heroDirection}` : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                >
                                    {previousHero && isHeroAnimating && renderHeroSlide(
                                        previousHero,
                                        false,
                                        `hero-carousel-layer hero-carousel-layer-leave hero-carousel-layer-${heroDirection}`
                                    )}
                                    {renderHeroSlide(
                                        activeHero ?? heroPrimary,
                                        true,
                                        `hero-carousel-layer hero-carousel-layer-enter hero-carousel-layer-${heroDirection}`
                                    )}
                                </div>
                            </div>
                        ) : (
                            renderHeroSkeleton()
                        )}
                    </div>
                </div>
            </section>

            <FeaturedStorefrontSection games={games} isLoading={isLoading} />

            {/* Мерчандайзинг: товар-first, сразу под featured. Модули РАЗНОЙ формы (рельса → список →
                рельса), без reveal — видны без скролла, чтобы главная не была стопкой одинаковых рядов. */}
            {!isLoading && games.length > 0 && (
                <section className="merch-rails">
                    <div className="container">
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 16,
                                justifyContent: "center",
                                padding: "16px 20px",
                                marginBottom: 30,
                                borderRadius: 18,
                                background: "rgba(255,255,255,0.7)",
                                border: "1px solid #ece8ff",
                            }}
                        >
                            {[
                                [`${games.length}+`, "Games in catalog"],
                                ["Instant", "Key delivery"],
                                ["4.8★", "Average rating"],
                                ["24/7", "Support"],
                            ].map(([value, label]) => (
                                <div key={label} style={{ textAlign: "center", minWidth: 130 }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: "#2c2354" }}>{value}</div>
                                    <div className="muted" style={{ fontSize: 13 }}>{label}</div>
                                </div>
                            ))}
                        </div>

                        <MerchRail
                            title="Best deals"
                            subtitle="Biggest discounts on right now"
                            to="/games?onSale=1"
                            items={bestDeals}
                        />
                        <TopSellers items={topSellers} baseUrl={urlService.apiBaseUrl} />
                        <MerchRail
                            title="New releases"
                            subtitle="Fresh in the store"
                            to="/games"
                            items={newReleases}
                        />
                    </div>
                </section>
            )}

            {/* Каталог по жанрам + блог. Пустой блог показывает дизайн-заглушку, а не сирую строку. */}
            <section className="explore-blog-section reveal fx-glow-tr">
                <div className="container">
                    <div className="section-heading">
                        <div className="heading-eyebrow">Catalog</div>
                        <h2>Explore our games</h2>
                        <p className="muted">Genres curated for every kind of player.</p>
                    </div>
                    <div className="explore-grid">
                        <div className="explore-column">
                            <div className="genre-grid">
                                {genres.map((genre) => (
                                    <Link className="genre-card" key={genre.title} to={`/games?filterCategory=${genre.title}`}>
                                        <div className="genre-icon">
                                            <FontAwesomeIcon icon={genre.icon} />
                                        </div>
                                        <div className="genre-copy">
                                            <div className="genre-title">{genre.title}</div>
                                            <div className="genre-description muted">{genre.description}</div>
                                        </div>
                                        <span className="genre-arrow" aria-hidden="true">
                                            <FontAwesomeIcon icon={faArrowRight} />
                                        </span>
                                    </Link>
                                ))}
                            </div>
                            <Link className="btn btn-outline full-width" to="/games">
                                Browse the full catalog
                            </Link>
                        </div>
                        <div className="explore-column">
                            <div className="column-header">
                                <h3>From the blog</h3>
                                <p className="muted">Guides, weekly picks and stories from the team.</p>
                            </div>
                            <div className="blog-list">
                                {blogLoading ? (
                                    Array.from({ length: 3 }).map((_, index) => (
                                        <div className="blog-item" key={`blog-skeleton-${index}`}>
                                            <div className="blog-thumb skeleton" aria-hidden="true" />
                                            <div className="blog-copy">
                                                <div className="skeleton h-5" />
                                                <div className="skeleton h-4 mt-2" />
                                            </div>
                                        </div>
                                    ))
                                ) : featuredBlogPosts.length === 0 ? (
                                    <div className="blog-empty">
                                        <div className="blog-empty-icon" aria-hidden="true">
                                            <FontAwesomeIcon icon={faFeather} />
                                        </div>
                                        <strong>Stories are on the way</strong>
                                        <p className="muted">Guides, weekly picks and dev stories will land here soon.</p>
                                    </div>
                                ) : (
                                    featuredBlogPosts.map((post) => (
                                        <Link className="blog-item" key={post.id} to={`/blog/${post.slug}`}>
                                            <div
                                                className="blog-thumb"
                                                aria-hidden="true"
                                                style={{ backgroundImage: `url(${post.coverUrl || blogFallbackCover})` }}
                                            />
                                            <div className="blog-copy">
                                                <div className="blog-title">{post.title}</div>
                                                <div className="blog-snippet muted">{post.excerpt}</div>
                                            </div>
                                        </Link>
                                    ))
                                )}
                            </div>
                            <Link className="btn btn-ghost" to="/blog">
                                Go to blog
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <section className="why-section reveal">
                <div className="container">
                    <div className="section-heading">
                        <div className="heading-eyebrow">Why Tale Shop</div>
                        <h2>Built around a safe purchase</h2>
                        <p className="muted">Curated games, secure payments, and delivery in moments.</p>
                    </div>
                    <div className="why-grid">
                        {reasons.map((reason) => (
                            <div className="why-card lift" key={reason.title}>
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

            <TestimonialsCarousel testimonials={testimonials} />

            <section className="newsletter-section reveal">
                <div className="container">
                    <div className="newsletter-card">
                        <div className="newsletter-copy">
                            <div className="heading-eyebrow">Stay in the loop</div>
                            <h3>Get weekly deals &amp; rare picks</h3>
                            <p className="muted">No spam. Unsubscribe anytime.</p>
                        </div>
                        {newsletterStatus === "done" ? (
                            <p className="newsletter-done">
                                {newsletterResult === "confirmed"
                                    ? "✓ You're in! Weekly deals and rare picks are on their way to your inbox."
                                    : "✓ Almost there — check your inbox and confirm the subscription."}
                            </p>
                        ) : knownSubscription ? (
                            // Уже подписан (с этого устройства или через аккаунт) — не предлагаем подписку заново.
                            <p className="newsletter-done">
                                {knownSubscription === "confirmed"
                                    ? "✓ You're subscribed — deals and rare picks land in your inbox. Manage it in account settings or via the link in any email."
                                    : "✓ Almost there — confirm the link we sent to your inbox to activate the subscription."}
                            </p>
                        ) : (
                            <form className="newsletter-form" onSubmit={handleNewsletterSubmit}>
                                <div className="input-row">
                                    <div className="input-icon">
                                        <FontAwesomeIcon icon={faEnvelope} />
                                    </div>
                                    <input
                                        type="email"
                                        placeholder="Enter your email"
                                        required
                                        value={newsletterEmail}
                                        onChange={(e) => {
                                            setNewsletterEmail(e.target.value);
                                            if (newsletterStatus === "error") {
                                                setNewsletterStatus("idle");
                                            }
                                        }}
                                    />
                                    <button
                                        className="btn btn-primary"
                                        type="submit"
                                        disabled={newsletterStatus === "sending"}
                                    >
                                        {newsletterStatus === "sending" ? "Saving…" : "Subscribe"}
                                    </button>
                                </div>
                                {newsletterStatus === "error" && (
                                    <p className="newsletter-error">
                                        Couldn&rsquo;t save your email right now — please try again in a minute.
                                    </p>
                                )}
                                <label className="checkbox-row">
                                    <input type="checkbox" defaultChecked />
                                    <span>Notify me about price drops</span>
                                </label>
                            </form>
                        )}
                    </div>
                </div>
            </section>

            <section className="faq-section reveal">
                <div className="container">
                    <div className="section-heading">
                        <div className="heading-eyebrow">FAQ</div>
                        <h3>Quick answers</h3>
                        <p className="muted">Common questions about delivery and payments.</p>
                    </div>
                    <div className="faq-list">
                        {faqs.map((item, index) => (
                            <div
                                className={`faq-item ${openFaqIndex === index ? "open" : ""}`}
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

            <section className="store-prefooter reveal">
                <div className="container">
                    <div className="store-prefooter-card">
                        <div className="store-prefooter-copy">
                            <h3>Find your next game today</h3>
                            <p className="muted">Step into the full catalog with weekly deals and curated picks.</p>
                        </div>
                        <div className="store-prefooter-actions">
                            <Link to="/games" className="btn btn-primary">
                                Go to Store
                            </Link>
                            <Link to="/blog" className="btn btn-outline">
                                Read the blog
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
