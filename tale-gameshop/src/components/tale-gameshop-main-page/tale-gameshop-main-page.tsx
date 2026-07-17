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
import type {
    BlogListItem
} from "../../types/blog";
import { slugify } from "../../utils/slugify";
import { subscribeNewsletter } from "../../api/newsletterApi";
import {
    rememberNewsletterSubscription,
    useKnownNewsletterSubscription,
} from "../../hooks/use-newsletter-subscribed";

// «Подбор по настроению» — фирменный блок Tale Shop: человек выбирает вайб вечера,
// мы ведём его на готовый фильтр каталога. Категории совпадают с фильтрами стора.
const moods = [
    {
        id: "adrenaline",
        label: "Adrenaline rush",
        icon: faBolt,
        category: "Action",
        title: "Something loud and fast",
        description: "Explosive shooters and high-octane action — for nights when you want your pulse in your ears."
    },
    {
        id: "story",
        label: "Epic story night",
        icon: faHatWizard,
        category: "RPG",
        title: "A tale to get lost in",
        description: "Sprawling RPGs with choices that matter. Start tonight, surface next weekend."
    },
    {
        id: "brain",
        label: "Galaxy-brain plays",
        icon: faChessKnight,
        category: "Strategy",
        title: "Outthink everything",
        description: "Build, command and conquer. Strategy picks for players who plan three turns ahead."
    },
    {
        id: "chill",
        label: "Cozy & chill",
        icon: faLeaf,
        category: "Indie",
        title: "Slow evening, warm game",
        description: "Gentle indies and calm puzzles to unwind with — no pressure, just vibes."
    },
    {
        id: "squad",
        label: "Squad night",
        icon: faUsers,
        category: "Co-op",
        title: "Better together",
        description: "Co-op picks for duos and full squads. Grab your friends and split the chaos."
    }
];

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

const steps = [
    { label: "Choose a game", helper: "Browse curated genres and picks." },
    { label: "Pay securely", helper: "Checkout with verified payments." },
    { label: "Get your key / download", helper: "Instant email delivery and quick access." }
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
    const [activeMoodId, setActiveMoodId] = useState(moods[0].id);
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
    const activeMood = moods.find((mood) => mood.id === activeMoodId) ?? moods[0];

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

            {/* Фирменный интерактив: подбор игры по настроению вечера. */}
            <section className="mood-section reveal">
                <div className="container">
                    <div className="mood-card">
                        <div className="mood-copy">
                            <div className="heading-eyebrow is-light">Tonight&rsquo;s pick</div>
                            <h2>What are you in the mood for?</h2>
                            <p>Tell us the vibe — we&rsquo;ll point you at the right shelf.</p>
                            <div className="mood-chips" role="tablist" aria-label="Pick a mood">
                                {moods.map((mood) => (
                                    <button
                                        key={mood.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={mood.id === activeMoodId}
                                        className={`mood-chip ${mood.id === activeMoodId ? "is-active" : ""}`}
                                        onClick={() => setActiveMoodId(mood.id)}
                                    >
                                        <FontAwesomeIcon icon={mood.icon} />
                                        <span>{mood.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="mood-result" key={activeMood.id}>
                            <div className="mood-result-icon" aria-hidden="true">
                                <FontAwesomeIcon icon={activeMood.icon} />
                            </div>
                            <h3>{activeMood.title}</h3>
                            <p>{activeMood.description}</p>
                            <Link to={`/games?filterCategory=${activeMood.category}`} className="btn btn-primary mood-cta">
                                Browse {activeMood.category} games
                                <FontAwesomeIcon icon={faArrowRight} />
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

            <section className="how-section reveal fx-glow-bl">
                <div className="container">
                    <div className="section-heading">
                        <div className="heading-eyebrow">Getting started</div>
                        <h2>How it works</h2>
                        <p className="muted">Three simple steps from browsing to playing.</p>
                    </div>
                    <div className="steps-grid">
                        {steps.map((step, index) => (
                            <div className="step-card lift" key={step.label}>
                                <div className="step-marker">{index + 1}</div>
                                <div className="step-body">
                                    <div className="step-title">{step.label}</div>
                                    <div className="step-helper muted">{step.helper}</div>
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
