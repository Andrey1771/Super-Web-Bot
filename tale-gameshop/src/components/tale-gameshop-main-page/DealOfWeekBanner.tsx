import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faCopy, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IApiClient } from "../../iterfaces/i-api-client";
import type { IKeycloakService } from "../../iterfaces/i-keycloak-service";
import { Game } from "../../models/game";
import SafeGameImage from "../common/SafeGameImage";
import { gameHref } from "./GameShelf";
import { padCountdown, useCountdown } from "./DealsCountdown";
import { analyticsClient } from "../../utils/analytics-client";
import { useSitePreferences } from "../../context/site-preferences";
import { formatMoney } from "../../utils/format-money";

// Состояние «карты удачи» текущего пользователя (GET /api/tarot/state).
type TarotState = {
    enabled: boolean;
    /** Карта открывается после первой покупки — так механика остаётся наградой, а не приманкой. */
    purchaseRequired: boolean;
    canDraw: boolean;
    nextDrawAt?: string | null;
    current?: { code: string; percent: number; expiresAt: string } | null;
};

type DealPhase = "idle" | "dealing" | "done";

// Тихие «пожелания» по бокам полосы: проявляются, всплывают и тают (магия исполнения желаний).
const tarotWishes = [
    "may a hidden gem find you ✦",
    "wish for it — the deck listens",
    "fortune favors the curious ✦",
    "tonight is a good night to play"
];

// Расклад раскрыт один раз за сессию: при возвратах на главную колоду не показываем снова.
const dealtStorageKey = "tarot-dealt";
// Темп раздачи: карты выходят по одной; клики во время раздачи временно ускоряют магию.
const firstCardDelayMs = 260;
const baseDealIntervalMs = 700;
const fastDealIntervalMs = 180;
const boostDurationMs = 1600;
// Пауза между последней картой и самопереворотом героя.
const heroFlipDelayMs = 900;
// Длина окружности руны отсчёта (r=42 в viewBox 88×88) — база для dash-дуги.
const runeCircumference = 2 * Math.PI * 42;

// «Расклад недели» — сказочное таро: колода с кнопкой «Deal the cards», по клику карты
// достаются ПО ОДНОЙ с вспышкой-кольцом; нетерпеливые клики ускоряют раздачу.
// Слева «карта удачи» (персональный рандомный промокод), справа закрытый запасной дил.
// ВАЖНО: 3D-переворот живёт на внутреннем слое .t-card-3d — Chrome игнорирует
// preserve-3d на самих <button>/<a>, из-за чего рубашка отражалась зеркально.
export default function DealOfWeekBanner({
    game,
    wings,
    baseUrl
}: {
    game: Game;
    /** Запасные игры из админ-конфига: первая становится правой картой расклада. */
    wings: Game[];
    baseUrl: string;
}) {
    const countdown = useCountdown(game.discountEndsAt);
    const { currency } = useSitePreferences();

    const services = useMemo(
        () => ({
            apiClient: container.get<IApiClient>(IDENTIFIERS.IApiClient),
            keycloakService: container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService)
        }),
        []
    );
    const isAuthenticated = Boolean(services.keycloakService.keycloak?.authenticated);

    const restoredDeal = useMemo(() => {
        try {
            return sessionStorage.getItem(dealtStorageKey) === "1";
        } catch {
            return false;
        }
    }, []);
    const [phase, setPhase] = useState<DealPhase>(restoredDeal ? "done" : "idle");
    const [dealtCount, setDealtCount] = useState(restoredDeal ? Number.MAX_SAFE_INTEGER : 0);
    const [tarot, setTarot] = useState<TarotState | null>(null);
    const [drawing, setDrawing] = useState(false);
    const [luckyFlipped, setLuckyFlipped] = useState(false);
    const [heroFlipped, setHeroFlipped] = useState(false);
    const [copied, setCopied] = useState(false);

    // Тайминги раздачи живут в ref'ах: клик-ускорение перепланирует уже взведённый таймер.
    const dealTimerRef = useRef<number | null>(null);
    const pendingIndexRef = useRef<number | null>(null);
    const boostUntilRef = useRef(0);
    const totalCardsRef = useRef(0);

    useEffect(() => {
        return () => {
            if (dealTimerRef.current != null) {
                window.clearTimeout(dealTimerRef.current);
            }
        };
    }, []);

    // Герой открывается сам — после того как вся раздача закончилась.
    useEffect(() => {
        if (phase !== "done") {
            return;
        }
        const timer = window.setTimeout(() => setHeroFlipped(true), heroFlipDelayMs);
        return () => window.clearTimeout(timer);
    }, [phase]);

    useEffect(() => {
        analyticsClient.trackEvent("tarot_view", { hero_game_id: game.id ?? "" });
        // Показ считаем один раз за визит на страницу.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!isAuthenticated) {
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const response = await services.apiClient.api.get("/api/tarot/state");
                if (!cancelled) {
                    const state = response.data as TarotState;
                    setTarot(state);
                    // Уже вытянутый действующий код показываем сразу открытой картой.
                    if (state.current) {
                        setLuckyFlipped(true);
                    }
                }
            } catch (error) {
                console.error("Failed to load tarot state", error);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, services.apiClient]);

    const luckyCode = tarot?.current ?? null;
    const luckyExpiry = useCountdown(luckyCode?.expiresAt);
    const nextDraw = useCountdown(tarot?.nextDrawAt ?? undefined);

    if (!countdown) {
        // Без живого дедлайна «ограниченное предложение» — враньё; полоса не рисуется.
        return null;
    }

    const finalPrice = Number(game.finalPrice ?? game.price);
    const percentLabel = `−${Number(game.discountPercent).toFixed(0)}%`;
    const sideGame = wings[0] ?? null;
    const tarotDisabled = tarot != null && !tarot.enabled;

    // Порядок выхода карт из колоды: удача → герой → запасная.
    const luckyVisible = !tarotDisabled;
    const heroOrder = luckyVisible ? 1 : 0;
    const sideOrder = heroOrder + 1;
    const totalCards = heroOrder + 1 + (sideGame ? 1 : 0);
    totalCardsRef.current = totalCards;

    const currentInterval = () =>
        Date.now() < boostUntilRef.current ? fastDealIntervalMs : baseDealIntervalMs;

    const queueReveal = (index: number, delayMs: number) => {
        pendingIndexRef.current = index;
        dealTimerRef.current = window.setTimeout(() => {
            pendingIndexRef.current = null;
            setDealtCount(index + 1);
            if (index + 1 >= totalCardsRef.current) {
                setPhase("done");
                try {
                    sessionStorage.setItem(dealtStorageKey, "1");
                } catch {
                    /* приватный режим — покажем колоду снова в следующий раз */
                }
            } else {
                queueReveal(index + 1, currentInterval());
            }
        }, delayMs);
    };

    const handleDeal = () => {
        if (phase !== "idle") {
            return;
        }
        setPhase("dealing");
        analyticsClient.trackEvent("tarot_deal_opened", { hero_game_id: game.id ?? "" });
        queueReveal(0, firstCardDelayMs);
    };

    // Нетерпеливый клик по полосе во время раздачи: короткий буст скорости
    // + уже взведённая карта выходит почти сразу.
    const handleBoost = () => {
        if (phase !== "dealing") {
            return;
        }
        boostUntilRef.current = Date.now() + boostDurationMs;
        if (dealTimerRef.current != null && pendingIndexRef.current != null) {
            window.clearTimeout(dealTimerRef.current);
            queueReveal(pendingIndexRef.current, fastDealIntervalMs);
        }
    };

    const dealClass = (order: number) => (dealtCount > order ? "t-dealt" : "t-undealt");

    const handleLuckyClick = async () => {
        if (phase !== "done") {
            return;
        }
        if (!isAuthenticated || !tarot || drawing || !tarot.canDraw) {
            setLuckyFlipped(true);
            return;
        }
        try {
            setDrawing(true);
            const response = await services.apiClient.api.post("/api/tarot/draw");
            const result = response.data as { code: string; percent: number; expiresAt: string; nextDrawAt: string };
            setTarot({
                enabled: true,
                // Розыгрыш удался — значит покупка у пользователя есть.
                purchaseRequired: false,
                canDraw: false,
                nextDrawAt: result.nextDrawAt,
                current: { code: result.code, percent: result.percent, expiresAt: result.expiresAt }
            });
            setLuckyFlipped(true);
            analyticsClient.trackEvent("tarot_draw", { percent: result.percent });
        } catch (error: any) {
            // Кулдаун с другого устройства и т.п. — просто показываем актуальное состояние.
            const nextDrawAt = error?.response?.data?.nextDrawAt;
            setTarot((prev) => (prev ? { ...prev, canDraw: false, nextDrawAt: nextDrawAt ?? prev.nextDrawAt } : prev));
            setLuckyFlipped(true);
        } finally {
            setDrawing(false);
        }
    };

    const handleCopy = async () => {
        if (!luckyCode) {
            return;
        }
        try {
            await navigator.clipboard.writeText(luckyCode.code);
            setCopied(true);
            analyticsClient.trackEvent("tarot_code_copied", { percent: luckyCode.percent });
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            // Буфер недоступен — код виден на карте, можно переписать руками.
        }
    };

    // Руны отсчёта: у каждой своя дуга-кольцо (доля от её цикла) — кольца тают с разной
    // скоростью, секундное бежит по кругу. Дни цикла не имеют — берём неделю как ориентир.
    const timerTiles = [
        ...(countdown.days > 0
            ? [{
                value: String(countdown.days),
                label: countdown.days === 1 ? "day" : "days",
                progress: Math.min(countdown.days / 7, 1)
            }]
            : []),
        { value: padCountdown(countdown.hours), label: "hours", progress: countdown.hours / 24 },
        { value: padCountdown(countdown.minutes), label: "minutes", progress: countdown.minutes / 60 },
        { value: padCountdown(countdown.seconds), label: "seconds", progress: countdown.seconds / 60 }
    ];

    // Содержимое лицевой стороны «карты удачи» — по состоянию пользователя.
    const renderLuckyFront = () => {
        if (!isAuthenticated) {
            return (
                <span className="t-lucky-front">
                    <span className="t-lucky-title">Your lucky card awaits</span>
                    <span className="t-lucky-text">Sign in and draw a personal discount — a new card every day.</span>
                    <Link className="t-lucky-btn" to="/logIn">
                        <i aria-hidden="true">✦</i>
                        Log in to draw
                        <i aria-hidden="true">✦</i>
                    </Link>
                </span>
            );
        }
        if (tarot?.purchaseRequired) {
            return (
                <span className="t-lucky-front">
                    <span className="t-lucky-title">Sealed until your first purchase</span>
                    <span className="t-lucky-text">
                        Buy any game — and the deck starts dealing you a personal discount every day.
                    </span>
                    <Link className="t-lucky-btn" to="/games">
                        <i aria-hidden="true">✦</i>
                        Browse games
                        <i aria-hidden="true">✦</i>
                    </Link>
                </span>
            );
        }
        if (luckyCode) {
            return (
                <span className="t-lucky-front">
                    <span className="t-lucky-percent">−{Number(luckyCode.percent).toFixed(0)}%</span>
                    <span className="t-lucky-title">just for you</span>
                    <span
                        className="t-lucky-code"
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                            event.stopPropagation();
                            void handleCopy();
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                void handleCopy();
                            }
                        }}
                        title="Copy code"
                    >
                        {luckyCode.code}
                        <FontAwesomeIcon icon={faCopy} />
                    </span>
                    <span className="t-lucky-text">
                        {copied
                            ? "Copied — apply it at checkout!"
                            : luckyExpiry
                                ? `Melts away in ${luckyExpiry.days > 0 ? `${luckyExpiry.days}d ` : ""}${padCountdown(luckyExpiry.hours)}:${padCountdown(luckyExpiry.minutes)}:${padCountdown(luckyExpiry.seconds)}`
                                : "Expired — draw again soon"}
                    </span>
                </span>
            );
        }
        return (
            <span className="t-lucky-front">
                <span className="t-lucky-title">The card is resting</span>
                <span className="t-lucky-text">
                    {nextDraw
                        ? `Next draw in ${nextDraw.days > 0 ? `${nextDraw.days}d ` : ""}${padCountdown(nextDraw.hours)}:${padCountdown(nextDraw.minutes)}`
                        : "Come back a bit later."}
                </span>
            </span>
        );
    };

    return (
        <section className="deal-week-section reveal">
            {/* Клик по любой точке полосы во время раздачи подгоняет магию. */}
            <div className="deal-week tarot-band" onClick={handleBoost}>
                <i className="fx-texture" aria-hidden="true"></i>
                <i className="tarot-spark ts-1" aria-hidden="true">✦</i>
                <i className="tarot-spark ts-2" aria-hidden="true">✦</i>
                <i className="tarot-spark ts-3" aria-hidden="true">✦</i>
                <i className="tarot-spark ts-4" aria-hidden="true">✦</i>
                <span className="tarot-wishes" aria-hidden="true">
                    {tarotWishes.map((wish, index) => (
                        <i className={`t-wish t-wish-${index + 1}`} key={wish}>{wish}</i>
                    ))}
                </span>

                <div className="container tarot-inner">
                    <div className="tarot-head">
                        <div className="heading-eyebrow is-light">Weekly spread · Deal of the week</div>
                        <h2 className="tarot-title">
                            <i className="tarot-title-spark" aria-hidden="true">✦</i>
                            <span className="tarot-title-text">
                                {phase === "idle"
                                    ? "The deck is waiting"
                                    : phase === "dealing"
                                        ? "The magic is working…"
                                        : "The cards are dealt"}
                            </span>
                            <i className="tarot-title-spark" aria-hidden="true">✦</i>
                        </h2>
                        <div className="tarot-timer-wrap">
                            <span className="tarot-timer-label">
                                <i aria-hidden="true">✦</i>
                                The spell breaks in
                                <i aria-hidden="true">✦</i>
                            </span>
                            <div className="tarot-runes" role="timer" aria-label="Time left for this deal">
                                {timerTiles.map((tile, index) => (
                                    <React.Fragment key={tile.label}>
                                        {index > 0 && <span className="t-rune-sep" aria-hidden="true">✦</span>}
                                        <span className={`t-rune ${tile.label === "seconds" ? "is-seconds" : ""}`}>
                                            {/* Дуга — SVG, а не conic-gradient: только stroke-linecap
                                                даёт скруглённые концы и чистое сглаживание. */}
                                            <svg className="t-rune-ring" viewBox="0 0 88 88" aria-hidden="true">
                                                <circle className="t-rune-track" cx="44" cy="44" r="42" />
                                                <circle
                                                    className="t-rune-arc"
                                                    cx="44"
                                                    cy="44"
                                                    r="42"
                                                    strokeDasharray={runeCircumference}
                                                    strokeDashoffset={runeCircumference * (1 - tile.progress)}
                                                />
                                            </svg>
                                            <span className="t-rune-value">{tile.value}</span>
                                            <span className="t-rune-label">{tile.label}</span>
                                        </span>
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    </div>

                    {phase === "idle" ? (
                        // Колода: стопка рубашек + волшебная кнопка. Клик начинает раздачу.
                        <div className="tarot-intro">
                            <button type="button" className="tarot-deck" onClick={handleDeal} aria-label="Deal the cards">
                                <span className="t-deck-card tdc-1"><span aria-hidden="true">✦</span></span>
                                <span className="t-deck-card tdc-2"><span aria-hidden="true">✦</span></span>
                                <span className="t-deck-card tdc-3"><span aria-hidden="true">✦</span></span>
                            </button>
                            <button type="button" className="btn btn-primary tarot-deal-btn" onClick={handleDeal}>
                                <FontAwesomeIcon icon={faWandMagicSparkles} />
                                Deal the cards
                            </button>
                            <p className="tarot-hint muted">A weekly deal and your personal lucky card hide in the deck.</p>
                        </div>
                    ) : (
                        <>
                            <div className="tarot-row">
                                {/* Карта удачи: рандомный персональный промокод. */}
                                {luckyVisible && (
                                    <button
                                        type="button"
                                        className={`t-card t-side t-lucky t-fan-left ${dealClass(0)} ${luckyFlipped ? "is-flipped" : ""} ${tarot?.canDraw ? "can-draw" : ""}`}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            handleBoost();
                                            void handleLuckyClick();
                                        }}
                                        disabled={drawing}
                                        aria-label="Draw your lucky card"
                                    >
                                        <span className="t-burst" aria-hidden="true"></span>
                                        <span className="t-deal-layer">
                                            <span className="t-card-3d">
                                                <span className="t-face t-back">
                                                    <span className="t-back-spark" aria-hidden="true">✦</span>
                                                    <span className="t-back-hint">{drawing ? "Shuffling…" : "Tap to draw"}</span>
                                                </span>
                                                <span className="t-face t-front">
                                                <span className="t-arcana">0 · The Fortune</span>
                                                {renderLuckyFront()}
                                            </span>
                                            </span>
                                        </span>
                                    </button>
                                )}

                                {/* Герой недели — открывается сам после раздачи. Карта целиком — ссылка,
                                    арт занимает всё поле, подпись лежит поверх на градиенте. */}
                                <Link
                                    to={gameHref(game)}
                                    className={`t-card t-hero ${dealClass(heroOrder)} ${heroFlipped ? "is-flipped" : ""}`}
                                    aria-label={`${game.title} — grab the deal`}
                                    onClick={() => analyticsClient.trackEvent("deal_week_cta_click", { game_id: game.id ?? "" })}
                                >
                                    <span className="t-burst" aria-hidden="true"></span>
                                    <span className="t-deal-layer">
                                    <span className="t-card-3d">
                                        <span className="t-face t-back">
                                            <span className="t-back-spark" aria-hidden="true">✦</span>
                                        </span>
                                        <span className="t-face t-front">
                                            <span className="t-cover">
                                                <SafeGameImage gameTitle={game.title} src={game.imagePath} baseUrl={baseUrl} loading="lazy" />
                                                <span className="t-arcana">I · The Deal</span>
                                                <span className="t-pct">{percentLabel}</span>
                                                <span className="t-hero-scrim">
                                                    <span className="t-caption-spark" aria-hidden="true">✦ ✦ ✦</span>
                                                    <span className="t-caption-title">{game.title}</span>
                                                    <span className="t-caption-price">
                                                        <s>{formatMoney(Number(game.price), currency)}</s> <b>{formatMoney(finalPrice, currency)}</b>
                                                    </span>
                                                    <span className="t-hero-cta">
                                                        Grab the deal
                                                        <FontAwesomeIcon icon={faArrowRight} />
                                                    </span>
                                                </span>
                                            </span>
                                        </span>
                                    </span>
                                    </span>
                                </Link>

                                {/* Запасной дил — переворачивается наведением (hover в CSS). */}
                                {sideGame && (
                                    <Link
                                        to={gameHref(sideGame)}
                                        className={`t-card t-side t-peek t-fan-right ${dealClass(sideOrder)}`}
                                        aria-label={sideGame.title}
                                    >
                                        <span className="t-burst" aria-hidden="true"></span>
                                        <span className="t-deal-layer">
                                        <span className="t-card-3d">
                                            <span className="t-face t-back">
                                                <span className="t-back-spark" aria-hidden="true">✦</span>
                                                <span className="t-back-hint">Hover to peek</span>
                                            </span>
                                            <span className="t-face t-front">
                                                <span className="t-cover">
                                                    <SafeGameImage
                                                        gameTitle={sideGame.title}
                                                        src={sideGame.imagePath}
                                                        baseUrl={baseUrl}
                                                        loading="lazy"
                                                    />
                                                    <span className="t-arcana">II · The Hidden Pick</span>
                                                    <span className="t-hero-scrim">
                                                        <span className="t-caption-spark" aria-hidden="true">✦</span>
                                                        <span className="t-caption-title">{sideGame.title}</span>
                                                        <span className="t-caption-price">
                                                            <b>{formatMoney(Number(sideGame.finalPrice ?? sideGame.price), currency)}</b>
                                                        </span>
                                                    </span>
                                                </span>
                                            </span>
                                        </span>
                                        </span>
                                    </Link>
                                )}
                            </div>

                            <p className="tarot-hint muted">
                                {phase === "dealing"
                                    ? "Tap anywhere to hurry the magic ✦"
                                    : "One weekly deal, one personal lucky card a day, one hidden pick. The shop deals — you choose."}
                            </p>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}
