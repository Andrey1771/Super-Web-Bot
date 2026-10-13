import { useTranslation } from "react-i18next";
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./deals-page.css";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IApiClient } from "../../iterfaces/i-api-client";
import type { IUrlService } from "../../iterfaces/i-url-service";
import { Game } from "../../models/game";
import { useCart } from "../../context/cart-context";
import { Product } from "../../reducers/cart-reducer";
import { useSitePreferences, formatMoney } from "../../context/site-preferences";
import { ITEM_LISTS, trackItemSelect, useItemListView } from "../../utils/item-list-tracking";
import NewsletterSignup from "../newsletter/NewsletterSignup";
import { useKnownNewsletterSubscription } from "../../hooks/use-newsletter-subscribed";
import { slugify } from "../../utils/slugify";
import StoreGameCard from "../common/StoreGameCard";
import CountUp from "../effects/CountUp";
import DealSpotlightCard from "./DealSpotlightCard";
import { padCountdown, useCountdown } from "../tale-gameshop-main-page/DealsCountdown";
import PageMeta from "../common/PageMeta";

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
            {/* Корпус ценника: прямоугольник 44..158 по x и 58..134 по y, слева — остриё.
                Скосы к острию раньше были разной длины (36 сверху против 28 снизу), из-за
                чего дырка и всё лицо оказывались ниже середины фигуры. Теперь оба по 32,
                и ось ценника совпадает с серединой корпуса — y=96. */}
            <path
                d="M44 58h100a14 14 0 0 1 14 14v48a14 14 0 0 1-14 14H44L16 102a8 8 0 0 1 0-12z"
                fill="#ece5ff"
                stroke="#c4b5fd"
                strokeWidth="2.5"
                strokeLinejoin="round"
            />
            <circle cx="44" cy="96" r="6" fill="#ffffff" stroke="#c4b5fd" strokeWidth="2.5" />
            {/* Лицо сдвинуто на (-5, -8) относительно прежнего: центр глаз и рта встал на
                x=101 — середину корпуса, — а краска по вертикали (86..108) на y=96. Раньше
                оно сидело на x=106 / y≈102, то есть вправо и вниз от середины ценника.
                Взаимные расстояния не тронуты: глаза по 12 в ширину, просвет между ними 20,
                рот ровно по этому просвету. */}
            <path d="M79 84q6 6 12 0" stroke="#7c6bb0" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M111 84q6 6 12 0" stroke="#7c6bb0" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M91 104q10 8 20 0" stroke="#7c6bb0" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
        <text x="152" y="48" fontSize="28" fontWeight="800" fill="#a78bfa" fontFamily="inherit">Z</text>
        <text x="172" y="30" fontSize="20" fontWeight="800" fill="#c4b5fd" fontFamily="inherit">z</text>
        <text x="188" y="17" fontSize="14" fontWeight="800" fill="#ddd3ff" fontFamily="inherit">z</text>
        <path d="M28 26l2.4 6.2 6.2 2.4-6.2 2.4-2.4 6.2-2.4-6.2-6.2-2.4 6.2-2.4z" fill="#c4b5fd" />
        <path d="M198 122l2 5.2 5.2 2-5.2 2-2 5.2-2-5.2-5.2-2 5.2-2z" fill="#ddd3ff" />
    </svg>
);

// Живой срок на карточке — то, чего нет в каталоге: там скидка выглядит просто ценой.
// Показываем только когда осталось мало (см. ENDS_SOON_HOURS): вечный отсчёт «ещё 84 дня»
// торопить не может, он только шумит.
const DealEndsBadge: React.FC<{ endsAt?: string }> = ({ endsAt }) => {
    const { t } = useTranslation();
    const countdown = useCountdown(endsAt);
    if (!countdown || countdown.days * 24 + countdown.hours >= ENDS_SOON_HOURS) {
        return null;
    }

    const { days, hours, minutes, seconds } = countdown;
    return (
        <span className="deal-badge-ends">
            {t("deals.endsIn")} {days > 0
                ? `${days}d ${padCountdown(hours)}h`
                : `${padCountdown(hours)}:${padCountdown(minutes)}:${padCountdown(seconds)}`}
        </span>
    );
};

/**
 * Сколько скидок показывает витрина. Это витрина, а не каталог: она показывает лучшее и
 * уводит за остальным в /games с готовым фильтром — там есть и страницы, и фильтры, и
 * сортировки. Раньше здесь стоял потолок в 48 БЕЗ единого слова о том, что список обрезан:
 * на девяти скидках это незаметно, на двухстах страница молча показывала бы 48 и писала
 * в шапке «48 games on sale» — то есть не обрезанный список, а неверное число.
 */
const DEALS_SHOWCASE_SIZE = 24;

/** Каталог с тем же отбором и порядком — там, где витрина кончается. */
const ALL_DEALS_URL = "/games?onSale=1&sortBy=discount";

/**
 * Порог «горит»: с этого момента на карточке тикает отсчёт. Неделя — горизонт, на котором
 * срок ещё влияет на решение купить сейчас; дальше это просто число, которое всегда на экране.
 */
const ENDS_SOON_HOURS = 24 * 7;

/**
 * Карточки каталога → строки витрины. Порядок НЕ трогаем: его задал сервер, и пересортировка
 * по проценту сломала бы вид «скоро закончится». Фильтр оставлен страховкой — «-0%» на
 * витрине скидок выглядит поломкой.
 */
const toDeals = (list: Game[]): DealGame[] =>
    list
        .map((game) => {
            const regularPrice = Number.isFinite(game.price) ? Number(game.price) : 0;
            const finalPrice = Number.isFinite(game.finalPrice ?? game.price)
                ? Number(game.finalPrice ?? game.price)
                : regularPrice;
            return { game, regularPrice, finalPrice, percent: Number(game.discountPercent ?? 0) };
        })
        .filter((deal) => deal.game.discountActive && deal.percent > 0 && deal.finalPrice < deal.regularPrice);

/** Запасная подборка при отсутствии скидок: берём с запасом, часть отсеется по цене и релизу. */
const BUDGET_FETCH_SIZE = 24;

/**
 * Порог бейджа «выгодно»: и условие показа, и сама подпись. Число трактуется в валюте
 * покупателя — каталог уже приходит в ней, и «Under €20» так же осмысленно, как «Under $20».
 */
const BUDGET_BADGE_MAX_PRICE = 20;

export default function DealsPage() {
    const { t } = useTranslation();
    // Подписан ли посетитель на уведомления о скидках — от этого зависит текст пустого
    // состояния: у подписавшегося просить почту уже незачем.
    const alreadySubscribed = useKnownNewsletterSubscription() !== null;
    const [games, setGames] = useState<Game[]>([]);
    // Сколько скидок всего — считает сервер. Витрина показывает только окно, и шапка
    // обязана говорить про все скидки, а не про размер окна.
    const [total, setTotal] = useState(0);
    // Второй порядок — «скоро закончится». null значит «ещё не спрашивали»: на первую
    // отрисовку он не нужен, а пересортировать уже приехавшее окно нельзя — в нём лежат
    // самые КРУПНЫЕ скидки, и самой срочной среди них может не быть вовсе.
    const [endingSoon, setEndingSoon] = useState<Game[] | null>(null);
    const [endingLoading, setEndingLoading] = useState(false);
    const [view, setView] = useState<"discount" | "ending">("discount");
    // Отдельный список: когда скидок нет, запасная подборка приходит своим запросом,
    // а не отбирается из скачанного каталога.
    const [fallbackGames, setFallbackGames] = useState<Game[]>([]);
    const [loading, setLoading] = useState(true);
    const { currency } = useSitePreferences();
    const { dispatch } = useCart();

    // Подписку на витрине предлагает плитка в шапке: раскрывается по нажатию, чтобы форма
    // не занимала место у тех, кто пришёл покупать.
    const [alertsOpen, setAlertsOpen] = useState(false);
    const services = useMemo(
        () => ({
            apiClient: container.get<IApiClient>(IDENTIFIERS.IApiClient),
            urlService: container.get<IUrlService>(IDENTIFIERS.IUrlService),
        }),
        []
    );

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                // Отбор скидок делает сервер: у каталога для этого есть onSale. Раньше страница
                // качала ВЕСЬ каталог и фильтровала в браузере — на 10 000 игр это мегабайты
                // ради десятка карточек.
                const api = services.apiClient.api;
                const sale = await api.get(
                    `/api/game/catalog?onSale=true&sort=discount&pageSize=${DEALS_SHOWCASE_SIZE}&currency=${encodeURIComponent(currency)}`
                );
                const saleItems = (sale.data?.items ?? []) as Game[];
                if (active) {
                    setGames(saleItems);
                    setTotal(Number(sale.data?.total ?? saleItems.length));
                }
                // Запасная подборка нужна, только когда скидок нет вовсе — тогда и запрашиваем,
                // уже отсортированную сервером по цене.
                if (saleItems.length === 0) {
                    const cheap = await api.get(
                        `/api/game/catalog?sort=price-asc&pageSize=${BUDGET_FETCH_SIZE}&currency=${encodeURIComponent(currency)}`
                    );
                    if (active) {
                        setFallbackGames((cheap.data?.items ?? []) as Game[]);
                    }
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
    }, [services.apiClient, currency]);

    // Порядок «скоро закончится» приезжает по требованию и только один раз за валюту.
    //
    // Флага загрузки в зависимостях быть не должно: он меняется в первой же строке эффекта,
    // React тут же вызвал бы очистку (active = false), ответ пришёл бы «в никуда», а сам
    // эффект больше не запустился бы — переключатель навсегда остался бы в «Ending soon…».
    // Ровно это и случилось: в тесте ответ успевал прийти микрозадачей раньше перерисовки,
    // а в браузере с настоящей сетью — нет.
    useEffect(() => {
        if (view !== "ending" || endingSoon !== null) {
            return;
        }
        let active = true;
        setEndingLoading(true);
        (async () => {
            try {
                const response = await services.apiClient.api.get(
                    `/api/game/catalog?onSale=true&sort=ending-soon&pageSize=${DEALS_SHOWCASE_SIZE}&currency=${encodeURIComponent(currency)}`
                );
                if (active) {
                    setEndingSoon((response.data?.items ?? []) as Game[]);
                }
            } catch (error) {
                console.error("Failed to load deals ending soon", error);
                // Порядок не приехал — остаёмся на прежнем, а не показываем пустоту.
                if (active) {
                    setView("discount");
                }
            } finally {
                if (active) {
                    setEndingLoading(false);
                }
            }
        })();
        return () => {
            active = false;
        };
    }, [view, endingSoon, services.apiClient, currency]);

    // Смена валюты меняет цены — прежний ответ второго порядка устарел.
    useEffect(() => {
        setEndingSoon(null);
    }, [currency]);

    const deals = useMemo(() => toDeals(games), [games]);
    const endingSoonDeals = useMemo(() => (endingSoon ? toDeals(endingSoon) : []), [endingSoon]);
    const visibleDeals = view === "ending" && endingSoon !== null ? endingSoonDeals : deals;
    // Первая позиция уезжает в крупную карточку — в сетке её дублировать нельзя.
    const [spotlight, ...gridDeals] = visibleDeals;

    // Шапка описывает ВСЕ скидки, а не выбранный вид: самая крупная лежит первой в порядке
    // «по размеру скидки» — по определению этого порядка.
    const bestPercent = deals.length > 0 ? Math.round(deals[0].percent) : 0;
    // Переключатель порядка показываем, только если у скидок вообще есть сроки: иначе он
    // переставил бы карточки и ничего не сообщил.
    const hasDeadlines = deals.some((deal) => Boolean(deal.game.discountEndsAt));

    // Fallback content so the page never feels hollow while no discounts are configured:
    // cheapest titles from the SAME fetched list — zero extra requests.
    useItemListView(
        ITEM_LISTS.deals,
        visibleDeals.map(({ game, finalPrice }) => ({ id: game.id, title: game.title ?? game.name, price: finalPrice })),
        currency,
    );

    const budgetPicks = useMemo(() => {
        if (deals.length > 0) {
            return [];
        }
        const priced = fallbackGames
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
    }, [deals.length, fallbackGames]);

    const handleAddToCart = (game: Game, price: number, origin?: Element | null) => {
        if (game.isComingSoon) {
            return;
        }
        dispatch({
            type: "ADD_TO_CART",
            meta: { origin },
            payload: {
                gameId: game.id ?? "",
                slug: game.slug,
                name: game.title ?? game.name,
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
            <PageMeta
                title={t("deals.metaTitle")}
                description={t("deals.metaDesc")}
                canonicalPath="/deals"
            />
            <section className="deals-hero">
                <i className="fx-texture" aria-hidden="true"></i>
                <i className="fx-orb deals-orb-1" aria-hidden="true"></i>
                <i className="fx-orb is-magenta deals-orb-2" aria-hidden="true"></i>
                <span className="deals-hero-glyph fx-float" aria-hidden="true">%</span>
                <div className="container deals-hero-inner">
                    <span className="deals-eyebrow">{t("deals.eyebrow")}</span>
                    <h1>{t("deals.title")}</h1>
                    <p className="deals-hero-subtext">{t("deals.subtitle")}</p>
                    {/* Stats only make sense when there ARE live deals — "0 / -0%" reads as broken. */}
                    {(loading || deals.length > 0) && (
                        <div className="deals-hero-stats">
                            <div className="deals-stat">
                                <span className="deals-stat-value">
                                    {loading ? "—" : <CountUp value={total} />}
                                </span>
                                <span className="deals-stat-label">{t("deals.gamesOnSale")}</span>
                            </div>
                            <div className="deals-stat">
                                <span className="deals-stat-value">
                                    {loading ? "—" : <CountUp value={bestPercent} prefix="-" suffix="%" />}
                                </span>
                                <span className="deals-stat-label">{t("deals.biggestDiscount")}</span>
                            </div>
                            <div className="deals-stat">
                                <span className="deals-stat-value">24/7</span>
                                <span className="deals-stat-label">{t("deals.deliverySupport")}</span>
                            </div>
                            {/* Четвёртая плитка — не число, а действие: она в том же ряду, поэтому
                                не выбивается, и стоит наверху, где человек решает, стоит ли ждать
                                следующей скидки. Форма раскрывается по нажатию — тем, кто пришёл
                                покупать, она места не занимает. */}
                            <button
                                type="button"
                                className={`deals-stat deals-stat-action${alertsOpen ? " is-open" : ""}`}
                                aria-expanded={alertsOpen}
                                aria-controls="deals-alerts-panel"
                                onClick={() => setAlertsOpen((open) => !open)}
                            >
                                <span className="deals-stat-value deals-stat-icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
                                        <path
                                            fill="currentColor"
                                            d="M12 2a6 6 0 0 0-6 6v3.6L4.3 15a1 1 0 0 0 .9 1.5h13.6a1 1 0 0 0 .9-1.5L18 11.6V8a6 6 0 0 0-6-6zm0 20a2.8 2.8 0 0 0 2.7-2H9.3A2.8 2.8 0 0 0 12 22z"
                                        />
                                    </svg>
                                </span>
                                <span className="deals-stat-label">{t("deals.dealAlerts")}</span>
                            </button>
                        </div>
                    )}

                    {alertsOpen && (
                        <div className="deals-alerts-panel" id="deals-alerts-panel">
                            <p>{t("deals.alertsText")}</p>
                            <NewsletterSignup source="deals" variant="dark" />
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
                        <div className="deals-empty-panel">
                            <div className="deals-empty-art">
                                <SleepingTagArt />
                            </div>
                            <div className="deals-empty-copy">
                                <h2>{t("deals.breakTitle")}</h2>
                                {/* Текст зависит от того, подписан ли уже человек.
                                    Раньше он был один на оба случая, и подписавшийся видел подряд
                                    «оставьте почту» и «вы уже в списке» — без поля ввода между
                                    ними. Просьба, на которую нечем ответить, читается как поломка
                                    страницы, хотя ломаться там нечему. */}
                                <p className="muted">
                                    {alreadySubscribed
                                        ? t("deals.breakSubscribed")
                                        : t("deals.breakText")}
                                </p>
                                <NewsletterSignup source="deals" />
                                <Link to="/games" className="deals-empty-browse">
                                    {t("deals.orBrowse")}
                                </Link>
                            </div>
                        </div>

                        {budgetPicks.length > 0 && (
                            <>
                                <div className="deals-toolbar">
                                    <h2>{t("deals.budgetPicks")}</h2>
                                    <span className="deals-count muted">
                                        {t("catalog.games", { count: budgetPicks.length })}
                                    </span>
                                </div>
                                <div className="deals-grid">
                                    {budgetPicks.map(({ game, price }, index) => (
                                        <StoreGameCard
                                            key={game.id ?? `budget-${index}`}
                                            game={game}
                                            baseUrl={services.urlService.apiBaseUrl}
                                            index={index}
                                            // Порог и подпись — одно число: раньше в подписи стоял
                                            // зашитый «$20», и при другой валюте бейдж врал.
                                            coverChip={price <= BUDGET_BADGE_MAX_PRICE
                                                ? t("deals.underPrice", { price: formatMoney(BUDGET_BADGE_MAX_PRICE, currency, { compact: true }) })
                                                : null}
                                            onOpen={() => trackItemSelect(
                                                ITEM_LISTS.deals,
                                                { id: game.id, title: game.title ?? game.name, price },
                                                index,
                                                currency,
                                            )}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <>
                        <div className="deals-toolbar">
                            <h2>{t("deals.onSaleNow")}</h2>
                            {/* Число — про ВСЕ скидки, а не про размер витрины. Когда их больше,
                                чем помещается, страница говорит это прямо и уводит за остальными
                                в каталог, а не обрезает список молча. */}
                            <span className="deals-count muted">
                                {total > visibleDeals.length
                                    ? t("deals.showing", { shown: visibleDeals.length, total })
                                    : t("catalog.games", { count: total })}
                            </span>
                            {hasDeadlines && (
                                // То, чего каталог не умеет: срочность. Порядок считает сервер —
                                // в приехавшем окне лежат самые крупные скидки, и самой срочной
                                // среди них может не быть вовсе.
                                <div className="deals-views" role="group" aria-label={t("deals.orderBy")}>
                                    <button
                                        type="button"
                                        className={`deals-view${view === "discount" ? " is-active" : ""}`}
                                        aria-pressed={view === "discount"}
                                        onClick={() => setView("discount")}
                                    >
                                        {t("deals.biggest")}
                                    </button>
                                    <button
                                        type="button"
                                        className={`deals-view${view === "ending" ? " is-active" : ""}`}
                                        aria-pressed={view === "ending"}
                                        onClick={() => setView("ending")}
                                    >
                                        {endingLoading ? t("deals.endingSoonLoading") : t("deals.endingSoon")}
                                    </button>
                                </div>
                            )}
                            {total > visibleDeals.length && (
                                <Link className="link-arrow deals-see-all" to={ALL_DEALS_URL}>
                                    {t("deals.seeAll", { count: total })}
                                    <span className="link-arrow__icon" aria-hidden="true">→</span>
                                </Link>
                            )}
                        </div>
                        <div className={`deals-grid${endingLoading ? " is-busy" : ""}`} aria-busy={endingLoading}>
                            {/* Первая позиция выбранного порядка идёт крупной карточкой: в «Biggest
                                discount» это самая большая скидка, в «Ending soon» — самая срочная.
                                Остальные — обычными плитками, чтобы у страницы был вход, а не ковёр. */}
                            {spotlight && (
                                <DealSpotlightCard
                                    game={spotlight.game}
                                    regularPrice={spotlight.regularPrice}
                                    finalPrice={spotlight.finalPrice}
                                    percent={spotlight.percent}
                                    currency={currency}
                                    baseUrl={services.urlService.apiBaseUrl}
                                    href={gameHref(spotlight.game)}
                                    onAddToCart={(event) => handleAddToCart(spotlight.game, spotlight.finalPrice, event.currentTarget)}
                                />
                            )}
                            {/* Процент, обе цены и платформы рисует общая карточка витрины —
                                та же, что в каталоге. Отдельной породы карточки у страницы
                                больше нет; своё здесь только срок над обложкой, которого нет
                                нигде, кроме скидок. */}
                            {gridDeals.map(({ game }, index) => (
                                <StoreGameCard
                                    key={game.id ?? `deal-${index}`}
                                    game={game}
                                    baseUrl={services.urlService.apiBaseUrl}
                                    index={index}
                                    coverExtra={<DealEndsBadge endsAt={game.discountEndsAt} />}
                                    onOpen={() => trackItemSelect(
                                        ITEM_LISTS.deals,
                                        { id: game.id, title: game.title ?? game.name, price: Number(game.finalPrice ?? game.price) },
                                        index,
                                        currency,
                                    )}
                                />
                            ))}
                        </div>
                    </>
                )}


                {/* Конец листинга — то же, что у Fanatical, GOG и Humble: витрина заканчивается
                    товарами и одним переходом дальше. Блок подписки здесь стоял три захода
                    подряд и в любой раскладке читался как вклиненный: в этой точке человек
                    либо листает дальше, либо уходит. Почту собирает подвал. */}
                {deals.length > 0 && (
                    <div className="deals-end">
                        <Link className="btn btn-outline deals-end-browse" to="/games">
                            {t("deals.browseFull")}
                            <span className="deals-end-arrow" aria-hidden="true">→</span>
                        </Link>
                    </div>
                )}
            </section>
        </div>
    );
}
