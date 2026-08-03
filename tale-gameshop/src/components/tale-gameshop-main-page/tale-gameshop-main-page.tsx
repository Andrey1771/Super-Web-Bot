import React, {
    useEffect,
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
    faCoins,
    faEnvelope,
    faFeather,
    faGamepad,
    faGift,
    faHatWizard,
    faLeaf,
    faPuzzlePiece,
    faScrewdriverWrench,
    faUsers
} from "@fortawesome/free-solid-svg-icons";
import {
    faWindows
} from "@fortawesome/free-brands-svg-icons";
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
import HeroBillboardCarousel, { hasActiveGameDiscount } from "./HeroBillboardCarousel";
import TestimonialsCarousel from "../testimonials/TestimonialsCarousel";
import FeaturedStorefrontSection from "../featured-storefront/FeaturedStorefrontSection";
import type {
    BlogListItem
} from "../../types/blog";
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

// Верх главной — витрина-сетка: крупная карусель игр слева, справа столбик из двух
// промо-карточек. Контент промо — плейсхолдеры, заменяются здесь без правки разметки.
const heroPromos = {
    // TODO: проценты/суммы — плейсхолдеры до продуктового решения. Ссылки ведут на будущие
    // страницы фич (первая покупка → каталог, кэшбэк → /rewards), перевесим при их появлении.
    // Минимум слов (ориентир — витрины конкурентов): только заголовок и чип кода,
    // без поясняющих предложений и CTA-строк — карточка кликабельна целиком.
    welcome: {
        eyebrow: "Welcome offer",
        title: "10% off your first order",
        code: "WELCOME10",
        to: "/games",
        icon: faGift,
        accent: "#8b5cf6",
        art: "welcome"
    },
    cashback: {
        eyebrow: "Rewards",
        title: "Cashback on every order",
        code: null,
        to: "/rewards",
        icon: faCoins,
        accent: "#34d17e",
        art: "cashback"
    }
};

// Ряд категорий под витриной — ведут в каталог с готовым фильтром (game-list-page умеет
// ?platforms= через запятую и ?filterCategory=). Значения должны совпадать с тем, как они
// заведены у игр в каталоге. photo — PNG-вырезка «настоящего» девайса из
// public/images/platforms (см. README там); пока файла нет, карточка откатывается на векторный art.
// «Software» как категории в каталоге пока нет — ссылка оживёт сама, когда категорию заведут,
// до тех пор каталог показывает дизайн-заглушку пустого фильтра.
const heroCategoryCards = [
    {
        title: "PC Games",
        icon: faWindows,
        to: "/games?platforms=PC",
        accent: "#8b5cf6",
        art: "pc",
        photo: "/images/platforms/keyboard.png"
    },
    {
        title: "Console Games",
        icon: faGamepad,
        to: "/games?platforms=PlayStation,Xbox",
        accent: "#3b82f6",
        art: "console",
        photo: "/images/platforms/gamepad.png"
    },
    {
        title: "Software",
        icon: faScrewdriverWrench,
        to: "/games?filterCategory=Software",
        accent: "#60a5fa",
        art: "software",
        photo: "/images/platforms/software.png"
    }
];

type HeroPromo = typeof heroPromos[keyof typeof heroPromos];
type HeroCategory = typeof heroCategoryCards[number];

// Кодовые иллюстрации карточек витрины (никаких фото — только вектор в наших цветах).
// Возвращают плоский SVG под конкретный вариант; заполняют пустые карточки и держат фирменный стиль.
const heroArt: Record<string, React.ReactNode> = {
    welcome: (
        <svg className="hs-art-svg" viewBox="0 0 120 120" fill="none" aria-hidden="true">
            <rect x="30" y="60" width="70" height="48" rx="5" fill="#6d45d9" />
            <rect x="24" y="47" width="82" height="17" rx="5" fill="#8b5cf6" />
            <rect x="58" y="47" width="14" height="61" fill="#a985ff" />
            <ellipse cx="50" cy="43" rx="10" ry="7" fill="#a985ff" />
            <ellipse cx="80" cy="43" rx="10" ry="7" fill="#a985ff" />
            <circle cx="65" cy="45" r="5" fill="#c4a9ff" />
            <circle cx="18" cy="34" r="7" fill="#8b5cf6" />
        </svg>
    ),
    cashback: (
        <svg className="hs-art-svg" viewBox="0 0 120 120" fill="none" aria-hidden="true">
            <ellipse cx="64" cy="98" rx="40" ry="14" fill="#1c8f57" />
            <ellipse cx="64" cy="87" rx="40" ry="14" fill="#2bb56e" />
            <ellipse cx="64" cy="76" rx="40" ry="14" fill="#1c8f57" />
            <ellipse cx="64" cy="65" rx="40" ry="14" fill="#2bb56e" />
            <ellipse cx="64" cy="54" rx="40" ry="14" fill="#34d17e" />
            <text x="64" y="60" textAnchor="middle" fontSize="17" fontWeight="700" fill="#0c3a24">$</text>
            <circle cx="18" cy="38" r="10" fill="#2bb56e" />
            <circle cx="104" cy="30" r="7" fill="#34d17e" />
        </svg>
    ),
    pc: (
        <svg className="hs-art-svg" viewBox="0 0 120 120" fill="none" aria-hidden="true">
            <rect x="28" y="38" width="27" height="27" rx="3" fill="#8b5cf6" />
            <rect x="62" y="33" width="27" height="27" rx="3" fill="#a985ff" />
            <rect x="28" y="72" width="27" height="27" rx="3" fill="#7c4de0" />
            <rect x="62" y="67" width="27" height="27" rx="3" fill="#9a72ff" />
        </svg>
    ),
    console: (
        <svg className="hs-art-svg" viewBox="0 0 150 110" fill="none" aria-hidden="true">
            <path d="M40 36h70c15 0 26 11 29 28l5 27c2 12-13 21-21 10l-15-19H42l-15 19c-8 11-23 2-21-10l5-27c3-17 14-28 29-28z" fill="#22407e" stroke="#3a63b8" strokeWidth="2" />
            <rect x="48" y="60" width="14" height="4.5" rx="2.25" fill="#6ea0ff" />
            <rect x="52.75" y="55.25" width="4.5" height="14" rx="2.25" fill="#6ea0ff" />
            <circle cx="104" cy="46" r="4.5" fill="#9ec2ff" />
            <circle cx="118" cy="58" r="4.5" fill="#9ec2ff" />
            <circle cx="104" cy="70" r="4.5" fill="#9ec2ff" />
            <circle cx="90" cy="58" r="4.5" fill="#9ec2ff" />
        </svg>
    ),
    software: (
        <svg className="hs-art-svg" viewBox="0 0 120 120" fill="none" aria-hidden="true">
            <rect x="20" y="30" width="56" height="44" rx="6" fill="#334667" />
            <rect x="20" y="30" width="56" height="12" rx="6" fill="#4a5f85" />
            <circle cx="28" cy="36" r="2.5" fill="#9db6e4" />
            <circle cx="36" cy="36" r="2.5" fill="#9db6e4" />
            <rect x="48" y="52" width="52" height="44" rx="6" fill="#60a5fa" opacity="0.92" />
            <rect x="48" y="52" width="52" height="12" rx="6" fill="#93c5fd" />
            <circle cx="56" cy="58" r="2.5" fill="#1e3a8a" />
            <circle cx="64" cy="58" r="2.5" fill="#1e3a8a" />
            <path d="M64 78l-6 5 6 5M84 78l6 5-6 5" stroke="#0f2a5e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
    )
};

const artFor = (variant?: string): React.ReactNode => (variant ? heroArt[variant] ?? null : null);

// Карточка платформы: фото-вырезка девайса (клавиатура/геймпад), а не рисованная пиктограмма.
// Отдельный компонент ради состояния фолбэка: PNG ещё не положили (404) → векторный art,
// карточка не пустеет.
function HeroCategoryCard({ category }: { category: HeroCategory }) {
    const [photoFailed, setPhotoFailed] = useState(false);
    return (
        <Link to={category.to} className="hs-category lift" style={{ ["--accent" as string]: category.accent } as React.CSSProperties}>
            <span className="hs-category-icon" aria-hidden="true">
                <FontAwesomeIcon icon={category.icon} />
            </span>
            <span className="hs-category-title">{category.title}</span>
            {photoFailed ? (
                <div className="hs-category-art" aria-hidden="true">{artFor(category.art)}</div>
            ) : (
                <span className={`hs-category-photo-wrap is-${category.art}`} aria-hidden="true">
                    <img
                        className="hs-category-photo"
                        src={category.photo}
                        alt=""
                        loading="lazy"
                        onError={() => setPhotoFailed(true)}
                    />
                </span>
            )}
        </Link>
    );
}

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
    const [activeMoodId, setActiveMoodId] = useState(moods[0].id);
    const [newsletterEmail, setNewsletterEmail] = useState("");
    const [newsletterStatus, setNewsletterStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
    // "pending" — гостю ушло письмо-подтверждение; "confirmed" — владелец аккаунта, подписан сразу.
    const [newsletterResult, setNewsletterResult] = useState<"pending" | "confirmed">("pending");
    const knownSubscription = useKnownNewsletterSubscription();
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

    const isLoading = games.length === 0;
    // Карусель — курируемая витрина, а не весь каталог: держим набор небольшим (иначе точки-навигация
    // растягиваются в простыню). Скидочные игры поднимаем вперёд — витрина сама подсвечивает выгоду;
    // внутри групп сохраняется порядок «свежие первыми». Memo обязателен — иначе новый массив
    // на каждый рендер сбрасывал бы карусель на первый слайд.
    const heroShowcase = useMemo(() => {
        const discounted = heroGames.filter(hasActiveGameDiscount);
        const rest = heroGames.filter((game) => !hasActiveGameDiscount(game));
        return [...discounted, ...rest].slice(0, 7);
    }, [heroGames]);
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

    const renderHeroPromo = (promo: HeroPromo) => (
        <Link to={promo.to} className="hs-promo lift" style={{ ["--accent" as string]: promo.accent } as React.CSSProperties}>
            <div className="hs-promo-art" aria-hidden="true">{artFor(promo.art)}</div>
            <span className="hs-promo-icon" aria-hidden="true">
                <FontAwesomeIcon icon={promo.icon} />
            </span>
            <span className="hs-promo-body">
                <span className="hs-promo-eyebrow">{promo.eyebrow}</span>
                <span className="hs-promo-title">{promo.title}</span>
                {promo.code && <span className="hs-promo-code">{promo.code}</span>}
            </span>
        </Link>
    );

    return (
        <div className="main-page">
            <section className="hero">
                {/* Витрина сознательно без видимого заголовка (представление несёт шапка),
                    но h1 странице нужен — SEO и скринридеры получают его невидимо. */}
                <h1 className="visually-hidden">Tale Shop — curated PC game keys with instant delivery</h1>
                <i className="fx-texture" aria-hidden="true"></i>
                <i className="fx-orb hero-orb-1" aria-hidden="true"></i>
                <i className="fx-orb is-magenta hero-orb-2" aria-hidden="true"></i>
                <div className="container hero-container">
                    {/* «Сцена» — общая подложка витрины: объединяет карусель, промо и категории
                        в один приподнятый планшет (референс difmark, палитра наша). */}
                    <div className="hero-stage">
                        <div className="hero-storefront">
                            <div className="hs-billboard">
                                <HeroBillboardCarousel games={heroShowcase} isLoading={isLoading} apiBaseUrl={urlService.apiBaseUrl} />
                            </div>

                            <div className="hs-side">
                                {renderHeroPromo(heroPromos.welcome)}
                                {renderHeroPromo(heroPromos.cashback)}
                            </div>
                        </div>

                        <div className="hero-categories">
                            {heroCategoryCards.map((category) => (
                                <HeroCategoryCard key={category.title} category={category} />
                            ))}
                        </div>
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
