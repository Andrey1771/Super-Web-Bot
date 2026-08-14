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
    faCalendarDays,
    faCheckCircle,
    faChessKnight,
    faClock,
    faCoins,
    faEnvelope,
    faEye,
    faGamepad,
    faGift,
    faHatWizard,
    faLeaf,
    faNewspaper,
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
import HeroBillboardCarousel from "./HeroBillboardCarousel";
import GameShelf, { gameHref } from "./GameShelf";
import DealsCountdown from "./DealsCountdown";
import DealOfWeekBanner from "./DealOfWeekBanner";
import SafeGameImage from "../common/SafeGameImage";
import PostCoverArt from "../blog-page/PostCoverArt";
import { formatReleaseDate } from "../../utils/format-release-date";
import type {
    BlogListItem
} from "../../types/blog";
import { subscribeNewsletter } from "../../api/newsletterApi";
import { getWeeklyChart, type WeeklyChartEntry } from "../../api/catalogApi";
import { hasVisibleDiscount } from "../../utils/game-pricing";
import { useSitePreferences } from "../../context/site-preferences";
import { formatMoney } from "../../utils/format-money";
import PageMeta from "../common/PageMeta";
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

// Trust-полоса: весь бывший маркетинг (Why/How it works/отзывы) сжат в одну строку из
// четырёх коротких обещаний — плотность difmark, подача наша. Живёт между полками
// «New» и «Deals» (как перебивки у конкурентов). Акценты — из палитры hero-промо.
const reasons = [
    { title: "Secure payments", description: "Protected checkout with trusted partners.", icon: faCheckCircle, accent: "#8b5cf6" },
    { title: "Instant delivery", description: "Your key moments after purchase.", icon: faBolt, accent: "#3b82f6" },
    { title: "Cashback on every order", description: "Tale Coins back on each purchase.", icon: faCoins, accent: "#34d17e" },
    { title: "Friendly support", description: "Here to help with installs and access.", icon: faUsers, accent: "#f0a02f" }
];

// Порог полки «Under $N» — и фильтр набора, и текст заголовка, и ссылка в каталог.
const budgetShelfMaxPrice = 10;

// Вместимость товарной полки: 4 колонки × 2 ряда (референс — витрины конкурентов).
const shelfCapacity = 8;

// Слайдов в hero-карусели: больше — и точки-навигация растягиваются в простыню.
const heroCarouselCapacity = 7;

// Новостей в полосе «Latest news»: ровно один ряд из четырёх карточек.
const newsStripCapacity = 4;

// Игр в подсказке mood-блока: три — достаточно, чтобы задать настроение, и не превращает
// фирменный блок в ещё одну полку.
const moodPreviewCapacity = 3;

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

// «16 hours ago» для новостных карточек; en-US, как весь витринный текст.
const timeAgo = (iso?: string): string | null => {
    if (!iso) {
        return null;
    }
    const diffMs = Date.now() - Date.parse(iso);
    if (Number.isNaN(diffMs) || diffMs < 0) {
        return null;
    }
    const hours = Math.floor(diffMs / 3_600_000);
    if (hours < 1) {
        return "Just now";
    }
    if (hours < 24) {
        return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
    }
    const days = Math.floor(hours / 24);
    if (days < 30) {
        return `${days} ${days === 1 ? "day" : "days"} ago`;
    }
    const months = Math.floor(days / 30);
    return `${months} ${months === 1 ? "month" : "months"} ago`;
};

export default function TaleGameshopMainPage() {
    const { currency } = useSitePreferences();
    const [games, setGames] = useState < Game[] > ([]);
    const [blogPosts, setBlogPosts] = useState < BlogListItem[] > ([]);
    // Серверный агрегат продаж за неделю: [{ gameId, sold }] — порядок полки «Popular this week».
    const [weeklyChart, setWeeklyChart] = useState<WeeklyChartEntry[]>([]);
    // Конфиг баннера «Deal of the week» (герой + кулисы), настраивается в админке скидок.
    const [dealSpotlight, setDealSpotlight] = useState<{ heroGameId?: string | null; wingGameIds?: string[] } | null>(null);
    const [activeMoodId, setActiveMoodId] = useState(moods[0].id);
    const [newsletterEmail, setNewsletterEmail] = useState("");
    const [newsletterStatus, setNewsletterStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
    // "pending" — гостю ушло письмо-подтверждение; "confirmed" — владелец аккаунта, подписан сразу.
    const [newsletterResult, setNewsletterResult] = useState<"pending" | "confirmed">("pending");
    const knownSubscription = useKnownNewsletterSubscription();
    const urlService = container.get < IUrlService > (IDENTIFIERS.IUrlService);
    // Одна загрузка при открытии страницы: запросы независимы и идут параллельно.
    useEffect(() => {
        fetchGames();
        fetchBlogPosts();
        fetchWeeklyChart();
        fetchDealOfWeek();
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
            const blogService = container.get<IBlogService>(IDENTIFIERS.IBlogService);
            const response = await blogService.getPosts({ page: 1, pageSize: 5 });
            setBlogPosts(response.items);
        } catch (err) {
            console.error(err);
            setBlogPosts([]);
        }
    };

    const fetchWeeklyChart = async () => {
        try {
            setWeeklyChart(await getWeeklyChart());
        } catch (err) {
            // Нет данных — полка чарта просто не рисуется.
        }
    };

    const fetchDealOfWeek = async () => {
        try {
            const apiClient = container.get < IApiClient > (IDENTIFIERS.IApiClient);
            const response = await apiClient.api.get("/api/deal-of-week");
            setDealSpotlight(response.data ?? null);
        } catch (err) {
            // Нет конфига — баннер просто не рисуется.
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
        const discounted = heroGames.filter(hasVisibleDiscount);
        const rest = heroGames.filter((game) => !hasVisibleDiscount(game));
        return [...discounted, ...rest].slice(0, heroCarouselCapacity);
    }, [heroGames]);
    const latestNews = useMemo(() => blogPosts.slice(0, newsStripCapacity), [blogPosts]);

    // Полка «Upcoming»: статус считает сервер (isComingSoon), сортировка — ближайший релиз первым;
    // непарсибельные даты в конец. Показываем немного — это анонс, а не каталог.
    const upcomingGames = useMemo(() => {
        const releaseTime = (game: Game) => {
            const parsed = Date.parse(game.releaseDate || "");
            return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
        };
        return games
            .filter((game) => game.isComingSoon)
            .sort((a, b) => releaseTime(a) - releaseTime(b))
            .slice(0, shelfCapacity);
    }, [games]);

    // Остальные полки собираются из вышедших игр; heroGames уже отсортированы «свежие первыми».
    const releasedGames = useMemo(() => heroGames.filter((game) => !game.isComingSoon), [heroGames]);
    const newGames = useMemo(() => releasedGames.slice(0, shelfCapacity), [releasedGames]);
    const dealGames = useMemo(
        () =>
            releasedGames
                .filter((game) => game.discountActive && (game.discountPercent ?? 0) > 0)
                .sort((a, b) => Number(b.discountPercent ?? 0) - Number(a.discountPercent ?? 0))
                .slice(0, shelfCapacity),
        [releasedGames]
    );
    // Таймер полки дилов тикает к САМОМУ БЛИЖНЕМУ концу скидки из показанных.
    const nearestDealEnd = useMemo(() => {
        const endTimes = dealGames
            .map((game) => Date.parse(game.discountEndsAt ?? ""))
            .filter((time) => !Number.isNaN(time));
        return endTimes.length > 0 ? new Date(Math.min(...endTimes)).toISOString() : undefined;
    }, [dealGames]);
    const budgetGames = useMemo(
        () =>
            releasedGames
                .filter((game) => {
                    const price = Number(game.finalPrice ?? game.price);
                    return price > 0 && price <= budgetShelfMaxPrice;
                })
                .sort((a, b) => Number(a.finalPrice ?? a.price) - Number(b.finalPrice ?? b.price))
                .slice(0, shelfCapacity),
        [releasedGames]
    );
    // Баннер «Deal of the week»: героя и кулисы выбирает сервер (админ-конфиг с фолбэками),
    // витрина только джойнит id с каталогом — цены/обложки не дублируются.
    const dealOfWeek = useMemo(() => {
        const heroId = dealSpotlight?.heroGameId?.toLowerCase();
        if (!heroId) {
            return null;
        }
        return releasedGames.find((game) => game.id?.toLowerCase() === heroId && game.discountActive) ?? null;
    }, [dealSpotlight, releasedGames]);
    const dealWings = useMemo(() => {
        const gameById = new Map(
            games.filter((game) => game.id).map((game) => [game.id!.toLowerCase(), game] as const)
        );
        return (dealSpotlight?.wingGameIds ?? [])
            .map((id) => gameById.get(id.toLowerCase()))
            .filter((game): game is Game => Boolean(game));
    }, [dealSpotlight, games]);
    // «Editor's picks»: ручное курирование из админки — прежний Featured-биллборд, ужатый
    // до обычной полки. Данные те же: флаг showInFeaturedStorefront + приоритет.
    const editorsPicks = useMemo(
        () =>
            releasedGames
                .filter((game) => game.showInFeaturedStorefront)
                .sort(
                    (a, b) =>
                        (a.featuredStorefrontPriority ?? Number.MAX_SAFE_INTEGER) -
                        (b.featuredStorefrontPriority ?? Number.MAX_SAFE_INTEGER)
                )
                .slice(0, shelfCapacity),
        [releasedGames]
    );
    // «Popular this week»: порядок задаёт серверный агрегат продаж, карточки — из каталога.
    const weeklyGames = useMemo(() => {
        if (weeklyChart.length === 0) {
            return [];
        }
        const gameById = new Map(
            releasedGames
                .filter((game) => game.id)
                .map((game) => [game.id!.toLowerCase(), game] as const)
        );
        return weeklyChart
            .map((entry) => gameById.get(entry.gameId.toLowerCase()))
            .filter((game): game is Game => Boolean(game))
            .slice(0, shelfCapacity);
    }, [weeklyChart, releasedGames]);
    const activeMood = moods.find((mood) => mood.id === activeMoodId) ?? moods[0];
    // Mood-picker 2.0: выбранный вайб сразу показывает живые игры категории, а не только текст.
    // Совпадение по жанрам мягкое (подстрока) — «RPG» находит «Role-Playing Games (RPGs)».
    const moodGames = useMemo(() => {
        const target = activeMood.category.toLowerCase();
        return releasedGames
            .filter((game) => (game.genres ?? []).some((genre) => genre.toLowerCase().includes(target)))
            .slice(0, moodPreviewCapacity);
    }, [releasedGames, activeMood.category]);

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
            <PageMeta
                title="Tale Shop — curated PC game keys"
                description="Hand-picked PC game keys with secure checkout and instant delivery. Global keys, no region locks."
                canonicalPath="/"
            />
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

            {/* Товарные полки — ядро главной («магазин = игры»). Каждая — курируемый срез каталога
                со ссылкой «View all» в каталог с готовым фильтром; пустая полка не рисуется. */}
            <GameShelf
                eyebrow="Fresh arrivals"
                title="New on Tale Shop"
                subtitle="The latest additions to the shelves."
                games={newGames}
                baseUrl={urlService.apiBaseUrl}
                viewAllTo="/games"
            />

            {/* Перебивка между полками: четыре обещания магазина отдельными карточками. */}
            <section className="trust-strip-section reveal">
                <div className="container">
                    <div className="trust-strip">
                        {reasons.map((reason) => (
                            <div
                                className="trust-item lift"
                                key={reason.title}
                                style={{ ["--accent" as string]: reason.accent } as React.CSSProperties}
                            >
                                <span className="trust-item-icon" aria-hidden="true">
                                    <FontAwesomeIcon icon={reason.icon} />
                                </span>
                                <span className="trust-item-copy">
                                    <strong>{reason.title}</strong>
                                    <span className="muted">{reason.description}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <GameShelf
                eyebrow="Deals"
                title="Best deals right now"
                subtitle="Prices drop, keys stay instant — while the timer runs."
                games={dealGames}
                baseUrl={urlService.apiBaseUrl}
                viewAllTo="/deals"
                headerAside={<DealsCountdown endsAt={nearestDealEnd} />}
            />

            {dealOfWeek && (
                <DealOfWeekBanner game={dealOfWeek} wings={dealWings} baseUrl={urlService.apiBaseUrl} />
            )}

            <GameShelf
                eyebrow="Editor's picks"
                title="Hand-picked by the team"
                subtitle="Curated highlights our editors vouch for."
                games={editorsPicks}
                baseUrl={urlService.apiBaseUrl}
                viewAllTo="/games"
            />

            <GameShelf
                eyebrow="On the horizon"
                title="Upcoming games"
                subtitle="Release dates locked — wishlist now, play on day one."
                games={upcomingGames}
                baseUrl={urlService.apiBaseUrl}
                viewAllTo="/games?comingSoon=1"
                coverChip={(game) => formatReleaseDate(game.releaseDate) ?? "Coming soon"}
                emptyState={
                    // Полка-анонс живёт на странице постоянно: пока будущих релизов нет — заглушка.
                    <>
                        <span className="shelf-empty-icon" aria-hidden="true">
                            <FontAwesomeIcon icon={faCalendarDays} />
                        </span>
                        <strong>Announcements on the way</strong>
                        <p className="muted">Fresh release dates land here the moment they&rsquo;re locked.</p>
                    </>
                }
            />

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
                            {moodGames.length > 0 ? (
                                // Живые игры выбранного вайба — полка прямо в mood-блоке.
                                <>
                                    <h3>{activeMood.title}</h3>
                                    <div className="mood-games">
                                        {moodGames.map((game) => (
                                            <Link className="mood-game" key={game.id ?? game.title} to={gameHref(game)}>
                                                <span className="mood-game-cover" aria-hidden="true">
                                                    <SafeGameImage
                                                        gameTitle={game.title}
                                                        src={game.imagePath}
                                                        baseUrl={urlService.apiBaseUrl}
                                                        loading="lazy"
                                                    />
                                                </span>
                                                <span className="mood-game-title">{game.title}</span>
                                                <span className="mood-game-price">
                                                    {formatMoney(Number(game.finalPrice ?? game.price), currency)}
                                                </span>
                                            </Link>
                                        ))}
                                    </div>
                                    <Link to={`/games?filterCategory=${activeMood.category}`} className="btn btn-primary mood-cta">
                                        Browse {activeMood.category} games
                                        <FontAwesomeIcon icon={faArrowRight} />
                                    </Link>
                                </>
                            ) : (
                                // В категории пока пусто — прежний текстовый вариант с переходом в каталог.
                                <>
                                    <div className="mood-result-icon" aria-hidden="true">
                                        <FontAwesomeIcon icon={activeMood.icon} />
                                    </div>
                                    <h3>{activeMood.title}</h3>
                                    <p>{activeMood.description}</p>
                                    <Link to={`/games?filterCategory=${activeMood.category}`} className="btn btn-primary mood-cta">
                                        Browse {activeMood.category} games
                                        <FontAwesomeIcon icon={faArrowRight} />
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* Недельный чарт продаж — порядок отдаёт сервер (/api/game/weekly-chart). */}
            <GameShelf
                eyebrow="Weekly chart"
                title="Popular this week"
                subtitle="The most bought games of the last 7 days."
                games={weeklyGames}
                baseUrl={urlService.apiBaseUrl}
                viewAllTo="/games"
            />

            <GameShelf
                eyebrow={`Under ${formatMoney(budgetShelfMaxPrice, currency, {compact: true})}`}
                title="Big fun, small price"
                subtitle={`Every pick on this shelf is ${formatMoney(budgetShelfMaxPrice, currency, {compact: true})} or less.`}
                games={budgetGames}
                baseUrl={urlService.apiBaseUrl}
                viewAllTo={`/games?filterMaxPrice=${budgetShelfMaxPrice}`}
            />

            {/* Latest news (наш блог = раздел «News»): карточки в стиле новостной витрины.
                Секция видна всегда; пока постов нет — оформленная заглушка. */}
            <section className="news-strip-section reveal">
                <div className="container">
                    <div className="shelf-head">
                        <div className="section-heading">
                            <div className="heading-eyebrow">News</div>
                            <h2>Latest news</h2>
                        </div>
                        <div className="shelf-head-side">
                            <Link className="shelf-view-all" to="/news">
                                View all →
                            </Link>
                        </div>
                    </div>
                    {latestNews.length === 0 ? (
                        <div className="shelf-empty">
                            <span className="shelf-empty-icon" aria-hidden="true">
                                <FontAwesomeIcon icon={faNewspaper} />
                            </span>
                            <strong>The newsroom is warming up</strong>
                            <p className="muted">Game news, guides and weekly picks will land here soon.</p>
                        </div>
                    ) : (
                        <div className="news-grid">
                            {latestNews.map((post) => (
                                <Link className="news-card lift" key={post.id} to={`/news/${post.slug}`}>
                                    {/* Та же обложка, что в ленте и статье: настоящая картинка
                                        поста или детерминированная заглушка по рубрике — вместо
                                        прежнего стокового фото с Unsplash на всех карточках. */}
                                    <div className="news-cover" aria-hidden="true">
                                        <PostCoverArt post={post} />
                                    </div>
                                    <div className="news-body">
                                        <span className="news-meta muted">
                                            <FontAwesomeIcon icon={faClock} />
                                            {timeAgo(post.publishedAt) ?? "Recently"}
                                        </span>
                                        <div className="news-title">{post.title}</div>
                                        <p className="news-excerpt muted">{post.excerpt}</p>
                                        {typeof post.viewsCount === "number" && post.viewsCount > 0 && (
                                            <span className="news-views muted">
                                                <FontAwesomeIcon icon={faEye} />
                                                {post.viewsCount}
                                            </span>
                                        )}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </section>

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

        </div>
    );
}
