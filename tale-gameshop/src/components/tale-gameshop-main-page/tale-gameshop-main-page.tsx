import React, {
    useCallback,
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
    faEye,
    faGamepad,
    faScrewdriverWrench,
    faGift,
    faHatWizard,
    faLeaf,
    faNewspaper,
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
import { ITEM_LISTS, trackItemSelect } from "../../utils/item-list-tracking";
import PostCoverArt from "../blog-page/PostCoverArt";
import { formatReleaseDate } from "../../utils/format-release-date";
import type {
    BlogListItem
} from "../../types/blog";
import { useSitePreferences } from "../../context/site-preferences";
import { formatMoney } from "../../utils/format-money";
import { gamesCatalogPath, softwareCatalogPath } from "../../utils/software";
import PageMeta from "../common/PageMeta";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import { formatNumber } from "../../i18n/format";

// «Подбор по настроению» — фирменный блок Tale Shop: человек выбирает вайб вечера,
// мы ведём его на готовый фильтр каталога. Категории совпадают с фильтрами стора.
const moods = [
// Подписи настроений лежат в словаре: home.mood.<id>.{label,title,text}.
    { id: "adrenaline", icon: faBolt, category: "Action" },
    { id: "story", icon: faHatWizard, category: "RPG" },
    { id: "brain", icon: faChessKnight, category: "Strategy" },
    { id: "chill", icon: faLeaf, category: "Indie" },
    { id: "squad", icon: faUsers, category: "Co-op" }
];

// Trust-полоса: весь бывший маркетинг (Why/How it works/отзывы) сжат в одну строку из
// четырёх коротких обещаний — плотность difmark, подача наша. Живёт между полками
// «New» и «Deals» (как перебивки у конкурентов). Акценты — из палитры hero-промо.
// Тексты — в словаре: home.reasons.<key>.{title,text}.
const reasons = [
    { key: "secure", icon: faCheckCircle, accent: "#8b5cf6" },
    { key: "instant", icon: faBolt, accent: "#3b82f6" },
    { key: "cashback", icon: faCoins, accent: "#34d17e" },
    { key: "support", icon: faUsers, accent: "#f0a02f" }
];

/**
 * Подпись ссылки полки с числом: «All 9 deals» вместо безликого «View all» — объём виден
 * до перехода. Пока полки не приехали, числа нет: показать в этот момент ноль значит
 * соврать, поэтому подпись просто остаётся без него.
 */
const withCount = (count: number | undefined, labelled: (amount: string) => string, plain: string) =>
    count && count > 0 ? labelled(formatNumber(count)) : plain;

// Порог полки «Under $N» — и фильтр набора, и текст заголовка, и ссылка в каталог.
const budgetShelfMaxPrice = 10;

// Вместимость полок (4 колонки × 2 ряда) и размер карусели теперь задаёт сервер: он же их
// и набирает. Здесь остался только порог «недорого» — он уезжает в запрос как правило витрины.

// Новостей в полосе «Latest news»: ровно один ряд из четырёх карточек.
const newsStripCapacity = 4;

// Верх главной — витрина-сетка: крупная карусель игр слева, справа столбик из двух
// промо-карточек. Контент промо — плейсхолдеры, заменяются здесь без правки разметки.
// Карточка «Welcome offer» вшита в код, а не приходит из базы: удаление промокода
// WELCOME10 её не гасит, и витрина продолжает звать вводить код, которого уже нет.
// Пока это флаг — выключать баннер вместе с промокодом руками. Чинить по-настоящему
// значит брать предложение из /api/promo, как остальную витрину берёт каталог.
const showWelcomePromo = true;

// Подписи промо — в словаре: home.promos.<key>.{eyebrow,title}.
const heroPromos = {
    // TODO: проценты/суммы — плейсхолдеры до продуктового решения. Ссылки ведут на будущие
    // страницы фич (первая покупка → каталог, кэшбэк → /rewards), перевесим при их появлении.
    // Минимум слов (ориентир — витрины конкурентов): только заголовок и чип кода,
    // без поясняющих предложений и CTA-строк — карточка кликабельна целиком.
    welcome: {
        key: "welcome",
        code: "WELCOME10",
        to: "/games",
        icon: faGift,
        accent: "#8b5cf6",
        art: "welcome"
    },
    cashback: {
        key: "cashback",
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
// «Software» ведёт в режим софта того же каталога (/games?type=software): ПО — отдельный вид товара со своими фильтрами.
// Подписи — в словаре: home.categories.<key>.
const heroCategoryCards = [
    {
        key: "pc",
        icon: faWindows,
        to: "/games?platforms=PC",
        accent: "#8b5cf6",
        art: "pc",
        photo: "/images/platforms/keyboard.png"
    },
    {
        key: "console",
        icon: faGamepad,
        to: "/games?platforms=PlayStation,Xbox",
        accent: "#3b82f6",
        art: "console",
        photo: "/images/platforms/gamepad.png"
    },
    {
        key: "software",
        icon: faScrewdriverWrench,
        to: softwareCatalogPath(),
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

const artFor =(variant?: string): React.ReactNode => (variant ? heroArt[variant] ?? null : null);

// Карточка платформы: фото-вырезка девайса (клавиатура/геймпад), а не рисованная пиктограмма.
// Отдельный компонент ради состояния фолбэка: PNG ещё не положили (404) → векторный art,
// карточка не пустеет.
function HeroCategoryCard({ category }: { category: HeroCategory }) {
    const { t } = useTranslation();
    const [photoFailed, setPhotoFailed] = useState(false);
    return (
        <Link to={category.to} className="hs-category lift" style={{ ["--accent" as string]: category.accent } as React.CSSProperties}>
            <span className="hs-category-icon" aria-hidden="true">
                <FontAwesomeIcon icon={category.icon} />
            </span>
            <span className="hs-category-title">{t(`home.categories.${category.key}`)}</span>
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

// «16 hours ago» для новостных карточек — в языке сайта.
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
        return i18n.t("common.justNow");
    }
    if (hours < 24) {
        return i18n.t("common.hoursAgo", { count: hours });
    }
    const days = Math.floor(hours / 24);
    if (days < 30) {
        return i18n.t("common.daysAgo", { count: days });
    }
    const months = Math.floor(days / 30);
    return i18n.t("common.monthsAgo", { count: months });
};

/**
 * Полки главной: ровно то, что показывает витрина, без каталога вокруг.
 *
 * Полка — это список id, а карточки лежат общим справочником: одна и та же игра легко
 * попадает на четыре полки сразу (свежая, со скидкой, недорогая, в настроении), и возить
 * её копии по одной на полку значит удваивать ответ на ровном месте.
 */
type HomeShelves = {
    games: Record<string, Game>;
    /**
     * Сколько всего игр стоит за каждой ссылкой «All …» — счёт даёт сервер тем же запросом,
     * который выполнит каталог после перехода. Полка показывает восемь карточек, и без
     * этого числа «View all» не говорит, восемь там ещё или четыре тысячи.
     */
    totals?: { games: number; deals: number; upcoming: number; budget: number; software?: number };
    /** ПО со скидкой — своя полка: игровые полки ПО не содержат. */
    hero: string[];
    upcoming: string[];
    newReleases: string[];
    deals: string[];
    nearestDealEndsAt?: string | null;
    budget: string[];
    editorsPicks: string[];
    popularThisWeek: string[];
    /** Сколько карточек полки — настоящие продажи недели; остальное добор сервера. */
    popularThisWeekSold?: number;
    dealOfWeek: { heroId?: string | null; wingIds: string[] };
    /** Ключ — категория настроения, которую запросила витрина. */
    moods: Record<string, string[]>;
};

export default function TaleGameshopMainPage() {
    const { t } = useTranslation();
    const { currency } = useSitePreferences();
    /**
     * Готовые полки главной. Раньше здесь лежал ВЕСЬ каталог, а полки нарезались в браузере:
     * на тридцати тысячах игр это мегабайты каждому посетителю ради шести десятков карточек.
     * Теперь отбор и порядок считает сервер, а витрина показывает то, что ей прислали.
     */
    const [home, setHome] = useState<HomeShelves | null>(null);
    const [blogPosts, setBlogPosts] = useState < BlogListItem[] > ([]);
    const [activeMoodId, setActiveMoodId] = useState(moods[0].id);
    const urlService = container.get < IUrlService > (IDENTIFIERS.IUrlService);
    // Одна загрузка при открытии страницы: запросы независимы и идут параллельно.
    useEffect(() => {
        fetchBlogPosts();
    }, []);

    // Игры — отдельно от остальных: они единственные несут цены, и при смене валюты их надо
    // взять заново. Остальным запросам валюта безразлична, дёргать их лишний раз незачем.
    useEffect(() => {
        fetchHome();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currency]);
    /**
     * Полки главной одним запросом. Валюта обязательна: без неё сервер отдаёт цены в базовой,
     * а витрина рисует их со значком выбранной — то есть показывает сумму, которой не существует.
     * Пересчёт делает сервер, фронт только показывает то, что ему прислали.
     *
     * budgetMax и moods уезжают отсюда: это правила оформления витрины (какая цена считается
     * «недорого» и какие настроения показывать), и держать их копию на сервере незачем.
     */
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

    const fetchHome = async () => {
        try {
            const apiClient = container.get < IApiClient > (IDENTIFIERS.IApiClient);
            const query = new URLSearchParams({
                currency,
                budgetMax: String(budgetShelfMaxPrice),
                moods: moods.map((mood) => mood.category).join(","),
            });
            const response = await apiClient.api.get(`/api/game/home?${query.toString()}`);
            setHome(response.data as HomeShelves);
        } catch (err) {
            // Полки не пришли — страница покажет скелеты, а не пустоту.
        }
    };

    // Полки приходят готовыми: порядок, отбор и размеры задаёт сервер (см. /api/game/home).
    // Здесь остаётся только развернуть id в карточки и не уронить страницу, пока ответ не пришёл.
    const shelf = useCallback(
        (ids?: string[]) => (ids ?? []).map((id) => home?.games?.[id]).filter((game): game is Game => Boolean(game)),
        [home],
    );

    const heroShowcase = shelf(home?.hero);
    const upcomingGames = shelf(home?.upcoming);
    const newGames = shelf(home?.newReleases);
    const dealGames = shelf(home?.deals);
    const nearestDealEnd = home?.nearestDealEndsAt ?? undefined;
    const budgetGames = shelf(home?.budget);
    const editorsPicks = shelf(home?.editorsPicks);
    const weeklyGames = shelf(home?.popularThisWeek);
    // Полку сервер всегда добирает; подпись обещает «самые покупаемые», только если продаж хватило на всю полку.
    const weeklySold = home?.popularThisWeekSold ?? weeklyGames.length;
    const weeklySubtitle = weeklyGames.length > 0 && weeklySold >= weeklyGames.length
        ? t("home.shelves.weekly.subtitleSold")
        : t("home.shelves.weekly.subtitleMixed");
    const dealOfWeek = home?.dealOfWeek?.heroId ? home.games[home.dealOfWeek.heroId] ?? null : null;
    const dealWings = shelf(home?.dealOfWeek?.wingIds);

    const isLoading = home === null;
    // Три полки ведут в один и тот же полный каталог, поэтому и подпись у них одна.
    const catalogLabel = withCount(home?.totals?.games, (amount) => t("home.shelves.allGames", { count: amount }), t("common.viewAll"));
    // Порог «недорого» в валюте покупателя — как в заголовке полки, чтобы ссылка не обещала
    // доллары человеку, который смотрит цены в евро.
    const budgetLabel = formatMoney(budgetShelfMaxPrice, currency, { compact: true });
    const latestNews = useMemo(() => blogPosts.slice(0, newsStripCapacity), [blogPosts]);

    const activeMood = moods.find((mood) => mood.id === activeMoodId) ?? moods[0];
    // Mood-picker 2.0: выбранный вайб сразу показывает живые игры категории, а не только текст.
    // Совпадение по жанрам мягкое (подстрока) — «RPG» находит «Role-Playing Games (RPGs)».
    // Игры настроения тоже считает сервер: совпадение по жанру мягкое (подстрока), поэтому
    // «RPG» находит «Role-Playing Games (RPGs)». Все настроения приходят разом — их пять,
    // и переключение вкладки не должно ждать запроса.
    const moodGames = shelf(home?.moods?.[activeMood.category]);

    const renderHeroPromo = (promo: HeroPromo) => (
        <Link to={promo.to} className="hs-promo lift" style={{ ["--accent" as string]: promo.accent } as React.CSSProperties}>
            <div className="hs-promo-art" aria-hidden="true">{artFor(promo.art)}</div>
            <span className="hs-promo-icon" aria-hidden="true">
                <FontAwesomeIcon icon={promo.icon} />
            </span>
            <span className="hs-promo-body">
                <span className="hs-promo-eyebrow">{t(`home.promos.${promo.key}.eyebrow`)}</span>
                <span className="hs-promo-title">{t(`home.promos.${promo.key}.title`)}</span>
                {promo.code && <span className="hs-promo-code">{promo.code}</span>}
            </span>
        </Link>
    );

    return (
        <div className="main-page">
            {/* Про ПО — только когда оно продаётся (ссылка в раздел /software). */}
            <PageMeta
                title={(home?.totals?.software ?? 0) > 0 ? t("home.metaTitleGamesSoftware") : t("home.metaTitleGames")}
                description={(home?.totals?.software ?? 0) > 0 ? t("home.metaDescGamesSoftware") : t("home.metaDescGames")}
                canonicalPath="/"
            />
            <section className="hero">
                {/* Витрина сознательно без видимого заголовка (представление несёт шапка),
                    но h1 странице нужен — SEO и скринридеры получают его невидимо. */}
                <h1 className="visually-hidden">{t("home.h1")}</h1>
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
                                {showWelcomePromo && renderHeroPromo(heroPromos.welcome)}
                                {renderHeroPromo(heroPromos.cashback)}
                            </div>
                        </div>

                        <div className="hero-categories">
                            {heroCategoryCards.map((category) => (
                                <HeroCategoryCard key={category.key} category={category} />
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Товарные полки — ядро главной («магазин = игры»). Каждая — курируемый срез каталога
                со ссылкой «View all» в каталог с готовым фильтром; пустая полка не рисуется. */}
            <GameShelf
                eyebrow={t("home.shelves.new.eyebrow")}
                title={t("home.shelves.new.title")}
                subtitle={t("home.shelves.new.subtitle")}
                games={newGames}
                baseUrl={urlService.apiBaseUrl}
                viewAllTo="/games"
                viewAllLabel={catalogLabel}
            />

            {/* Перебивка между полками: четыре обещания магазина отдельными карточками. */}
            <section className="trust-strip-section">
                <div className="container">
                    <div className="trust-strip">
                        {reasons.map((reason) => (
                            <div
                                className="trust-item lift"
                                key={reason.key}
                                style={{ ["--accent" as string]: reason.accent } as React.CSSProperties}
                            >
                                <span className="trust-item-icon" aria-hidden="true">
                                    <FontAwesomeIcon icon={reason.icon} />
                                </span>
                                <span className="trust-item-copy">
                                    <strong>{t(`home.reasons.${reason.key}.title`)}</strong>
                                    <span className="muted">{t(`home.reasons.${reason.key}.text`)}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <GameShelf
                eyebrow={t("home.shelves.deals.eyebrow")}
                title={t("home.shelves.deals.title")}
                subtitle={t("home.shelves.deals.subtitle")}
                games={dealGames}
                baseUrl={urlService.apiBaseUrl}
                viewAllTo="/deals"
                viewAllLabel={withCount(home?.totals?.deals, (amount) => t("home.shelves.allDeals", { count: amount }), t("home.shelves.allDealsPlain"))}
                className="is-surface"
                headerAside={<DealsCountdown endsAt={nearestDealEnd} />}
            />

            {dealOfWeek && (
                <DealOfWeekBanner game={dealOfWeek} wings={dealWings} baseUrl={urlService.apiBaseUrl} />
            )}

            <GameShelf
                eyebrow={t("home.shelves.editors.eyebrow")}
                title={t("home.shelves.editors.title")}
                subtitle={t("home.shelves.editors.subtitle")}
                games={editorsPicks}
                baseUrl={urlService.apiBaseUrl}
                viewAllTo="/games"
                viewAllLabel={catalogLabel}
            />

            <GameShelf
                eyebrow={t("home.shelves.upcoming.eyebrow")}
                title={t("home.shelves.upcoming.title")}
                subtitle={t("home.shelves.upcoming.subtitle")}
                games={upcomingGames}
                baseUrl={urlService.apiBaseUrl}
                viewAllTo="/games?comingSoon=1"
                viewAllLabel={withCount(home?.totals?.upcoming, (amount) => t("home.shelves.allUpcoming", { count: amount }), t("home.shelves.allUpcomingPlain"))}
                className="is-surface"
                coverChip={(game) => formatReleaseDate(game.releaseDate) ?? t("common.comingSoon")}
                emptyState={
                    // Полка-анонс живёт на странице постоянно: пока будущих релизов нет — заглушка.
                    <>
                        <span className="shelf-empty-icon" aria-hidden="true">
                            <FontAwesomeIcon icon={faCalendarDays} />
                        </span>
                        <strong>{t("home.shelves.upcoming.emptyTitle")}</strong>
                        <p className="muted">{t("home.shelves.upcoming.emptyText")}</p>
                    </>
                }
            />

            {/* Фирменный интерактив: подбор игры по настроению вечера. */}
            <section className="mood-section">
                <div className="container">
                    <div className="mood-card">
                        <div className="mood-copy">
                            <div className="heading-eyebrow is-light">{t("home.mood.eyebrow")}</div>
                            <h2>{t("home.mood.title")}</h2>
                            <p>{t("home.mood.text")}</p>
                            <div className="mood-chips" role="tablist" aria-label={t("home.mood.pick")}>
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
                                        <span>{t(`home.mood.${mood.id}.label`)}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="mood-result" key={activeMood.id}>
                            {moodGames.length > 0 ? (
                                // Живые игры выбранного вайба — полка прямо в mood-блоке.
                                <>
                                    <h3>{t(`home.mood.${activeMood.id}.title`)}</h3>
                                    <div className="mood-games">
                                        {moodGames.map((game: Game, index: number) => (
                                            <Link
                                                className="mood-game"
                                                key={game.id ?? game.title}
                                                to={gameHref(game)}
                                                onClick={() => trackItemSelect(
                                                    ITEM_LISTS.homeMood,
                                                    { id: game.id, title: game.title, price: Number(game.finalPrice ?? game.price) },
                                                    index,
                                                    currency,
                                                )}
                                            >
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
                                                    {formatMoney(Number(game.finalPrice ?? game.price), game.currency ?? currency)}
                                                </span>
                                            </Link>
                                        ))}
                                    </div>
                                    <Link to={`/games?filterCategory=${activeMood.category}`} className="btn btn-primary mood-cta">
                                        {t("home.mood.browse", { category: activeMood.category })}
                                        <FontAwesomeIcon icon={faArrowRight} />
                                    </Link>
                                </>
                            ) : (
                                // В категории пока пусто — прежний текстовый вариант с переходом в каталог.
                                <>
                                    <div className="mood-result-icon" aria-hidden="true">
                                        <FontAwesomeIcon icon={activeMood.icon} />
                                    </div>
                                    <h3>{t(`home.mood.${activeMood.id}.title`)}</h3>
                                    <p>{t(`home.mood.${activeMood.id}.text`)}</p>
                                    <Link to={`/games?filterCategory=${activeMood.category}`} className="btn btn-primary mood-cta">
                                        {t("home.mood.browse", { category: activeMood.category })}
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
                eyebrow={t("home.shelves.weekly.eyebrow")}
                title={t("home.shelves.weekly.title")}
                subtitle={weeklySubtitle}
                games={weeklyGames}
                baseUrl={urlService.apiBaseUrl}
                viewAllTo="/games"
                viewAllLabel={catalogLabel}
            />

            <GameShelf
                eyebrow={t("home.shelves.budget.eyebrow", { price: budgetLabel })}
                title={t("home.shelves.budget.title")}
                subtitle={t("home.shelves.budget.subtitle", { price: budgetLabel })}
                games={budgetGames}
                baseUrl={urlService.apiBaseUrl}
                viewAllTo={gamesCatalogPath({ filterMaxPrice: String(budgetShelfMaxPrice) })}
                className="is-surface"
                viewAllLabel={withCount(
                    home?.totals?.budget,
                    (amount) => t("home.shelves.allUnder", { count: amount, price: budgetLabel }),
                    t("home.shelves.allUnderPlain", { price: budgetLabel }),
                )}
            />

            {/* Latest news (наш блог = раздел «News»): карточки в стиле новостной витрины.
                Секция видна всегда; пока постов нет — оформленная заглушка. */}
            <section className="news-strip-section">
                <div className="container">
                    <div className="shelf-head">
                        <div className="section-heading">
                            <div className="heading-eyebrow">{t("home.news.eyebrow")}</div>
                            <h2>{t("home.news.title")}</h2>
                        </div>
                        <div className="shelf-head-side">
                            <Link className="link-arrow" to="/news">
                                {t("home.news.all")}
                                <span className="link-arrow__icon" aria-hidden="true">→</span>
                            </Link>
                        </div>
                    </div>
                    {latestNews.length === 0 ? (
                        <div className="shelf-empty">
                            <span className="shelf-empty-icon" aria-hidden="true">
                                <FontAwesomeIcon icon={faNewspaper} />
                            </span>
                            <strong>{t("home.news.emptyTitle")}</strong>
                            <p className="muted">{t("home.news.emptyText")}</p>
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
                                            {timeAgo(post.publishedAt) ?? t("common.recently")}
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

        </div>
    );
}
