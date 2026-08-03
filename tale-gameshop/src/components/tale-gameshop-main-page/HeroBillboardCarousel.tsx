import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { Game } from "../../models/game";
import SafeGameImage from "../common/SafeGameImage";
import { slugify } from "../../utils/slugify";

// Главный баннер витрины — плоская слайд-карусель игр (лента, сдвигаемая по горизонтали).
// Слайд целиком — ссылка на страницу игры: жанровый бейдж, название, цена и CTA поверх обложки.
const AUTOPLAY_MS = 6000;
// Минимальный сдвиг пальцем, который считаем свайпом, а не случайным касанием при тапе.
const SWIPE_THRESHOLD_PX = 40;

interface HeroBillboardCarouselProps {
    games: Game[];
    isLoading: boolean;
    apiBaseUrl?: string;
}

const gameHref = (game: Game) =>
    `/games/${slugify(game.slug?.trim() || game.title || game.name || "game")}`;

// Активная скидка по правилам каталога — только реальные данные GameDiscount.
// Экспортируется: главная поднимает скидочные игры в начало витрины.
export const hasActiveGameDiscount = (game: Game) => {
    const regular = Number.isFinite(game.price) ? Number(game.price) : 0;
    const final = Number.isFinite(game.finalPrice ?? NaN) ? Number(game.finalPrice) : regular;
    return Boolean(game.discountActive && game.discountPercent && game.discountPercent > 0 && final < regular);
};

const gamePrice = (game: Game) => {
    const regular = Number.isFinite(game.price) ? Number(game.price) : 0;
    const final = Number.isFinite(game.finalPrice ?? NaN) ? Number(game.finalPrice) : regular;
    const hasDiscount = hasActiveGameDiscount(game);
    return {
        regular,
        final,
        hasDiscount,
        percent: hasDiscount ? Math.round(Number(game.discountPercent)) : 0
    };
};

const mod = (value: number, size: number) => ((value % size) + size) % size;

export default function HeroBillboardCarousel({ games, isLoading, apiBaseUrl }: HeroBillboardCarouselProps) {
    const count = games.length;
    // Позиция в расширенной ленте [клон последнего, ...игры, клон первого]:
    // -1 и count — клоны. Благодаря им обход края всегда едет в сторону движения
    // (с последнего вперёд — вправо на копию первого), а не отматывается через всю ленту.
    const [position, setPosition] = useState(0);
    // Снап с клона на настоящий слайд делается без анимации (transition: none на один кадр).
    const [instant, setInstant] = useState(false);
    const pausedRef = useRef(false);
    const touchStartXRef = useRef<number | null>(null);
    const trackRef = useRef<HTMLDivElement | null>(null);
    const positionRef = useRef(0);
    positionRef.current = position;

    // Набор игр сменился (загрузка/обновление) — возвращаемся к первому слайду без анимации.
    useEffect(() => {
        setInstant(true);
        setPosition(0);
    }, [games]);

    // Двойной rAF гарантирует, что браузер отрисовал мгновенный сдвиг до возврата анимации.
    useEffect(() => {
        if (!instant) {
            return;
        }
        const id = requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)));
        return () => cancelAnimationFrame(id);
    }, [instant]);

    const advance = useCallback((dir: 1 | -1) => {
        setPosition((prev) => {
            // Пока стоим на клоне (обход края ещё не снапнулся) — новые шаги не копим.
            if (prev < 0 || prev >= count) {
                return prev;
            }
            return prev + dir;
        });
    }, [count]);

    // Автопрокрутка (пауза на наведении и во время касания).
    useEffect(() => {
        if (count <= 1) {
            return;
        }
        const id = window.setInterval(() => {
            if (!pausedRef.current) {
                advance(1);
            }
        }, AUTOPLAY_MS);
        return () => window.clearInterval(id);
    }, [count, advance]);

    // Доехали до клона — мгновенно перескакиваем на его настоящий слайд.
    const handleTransitionEnd = (event: React.TransitionEvent) => {
        if (event.target !== trackRef.current || event.propertyName !== "transform") {
            return;
        }
        if (positionRef.current >= count) {
            setInstant(true);
            setPosition(0);
        } else if (positionRef.current <= -1) {
            setInstant(true);
            setPosition(count - 1);
        }
    };

    const handleTouchStart = (event: React.TouchEvent) => {
        pausedRef.current = true;
        touchStartXRef.current = event.touches[0]?.clientX ?? null;
    };

    const handleTouchEnd = (event: React.TouchEvent) => {
        pausedRef.current = false;
        const startX = touchStartXRef.current;
        touchStartXRef.current = null;
        const endX = event.changedTouches[0]?.clientX;
        if (startX === null || endX === undefined) {
            return;
        }
        const delta = endX - startX;
        if (Math.abs(delta) >= SWIPE_THRESHOLD_PX) {
            advance(delta < 0 ? 1 : -1);
        }
    };

    if (isLoading || count === 0) {
        return <div className="hb-skeleton skeleton" aria-hidden="true" />;
    }

    const activeIndex = mod(position, count);
    // Расширенная лента с клонами по краям (при единственном слайде клоны не нужны).
    const extended = count > 1
        ? [
            { game: games[count - 1], clone: true },
            ...games.map((game) => ({ game, clone: false })),
            { game: games[0], clone: true }
        ]
        : games.map((game) => ({ game, clone: false }));
    const trackOffset = count > 1 ? position + 1 : 0;

    return (
        <div
            className="hero-billboard"
            aria-roledescription="carousel"
            aria-label="Featured games"
            onMouseEnter={() => { pausedRef.current = true; }}
            onMouseLeave={() => { pausedRef.current = false; }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <div
                className="hb-track"
                ref={trackRef}
                style={{
                    transform: `translateX(-${trackOffset * 100}%)`,
                    transition: instant ? "none" : undefined
                }}
                onTransitionEnd={handleTransitionEnd}
            >
                {extended.map((entry, slideIndex) => {
                    const { game, clone } = entry;
                    const price = gamePrice(game);
                    const realIndex = count > 1 ? slideIndex - 1 : slideIndex;
                    const isActive = !clone && realIndex === activeIndex;
                    return (
                        <Link
                            to={gameHref(game)}
                            className="hb-slide"
                            key={clone ? `clone-${slideIndex === 0 ? "head" : "tail"}` : game.id ?? realIndex}
                            tabIndex={isActive ? 0 : -1}
                            aria-hidden={!isActive}
                            aria-label={`Open game ${game.title}`}
                        >
                            <div className="hb-media">
                                {/* Первый слайд — LCP первого экрана, грузим сразу; остальные не торопим. */}
                                <SafeGameImage
                                    gameTitle={game.title}
                                    src={game.imagePath}
                                    baseUrl={apiBaseUrl}
                                    loading={realIndex === 0 && !clone ? "eager" : "lazy"}
                                />
                            </div>
                            <span className="hb-scrim" aria-hidden="true" />
                            <span className="hb-content">
                                <span className="hb-footer">
                                    <span className="hb-title">{game.title}</span>
                                    <span className="hb-price-row">
                                        {price.hasDiscount && (
                                            <>
                                                <span className="hb-deal">−{price.percent}%</span>
                                                <span className="hb-price-old">${price.regular.toFixed(2)}</span>
                                            </>
                                        )}
                                        <span className="hb-price">${price.final.toFixed(2)}</span>
                                    </span>
                                    <span className="hb-cta">
                                        View game
                                        <FontAwesomeIcon icon={faArrowRight} />
                                    </span>
                                </span>
                            </span>
                        </Link>
                    );
                })}
            </div>

            {/* Перелистывание: зоны по краям видимого арта (затемняются на наведении,
                клик листает) + точки + свайп + автопрокрутка. */}
            {count > 1 && (
                <>
                    <button
                        type="button"
                        className="hb-edge hb-edge-prev"
                        onClick={() => advance(-1)}
                        aria-label="Previous game"
                    />
                    {/* Кликабельна только внутренняя полоса (.hb-edge-hit) у кромки видимого
                        арта; сама кнопка шире — несёт градиент затемнения до края ряда,
                        но с выключенными pointer-events, чтобы не перекрывать промо. */}
                    <button
                        type="button"
                        className="hb-edge hb-edge-next"
                        onClick={() => advance(1)}
                        aria-label="Next game"
                    >
                        <span className="hb-edge-hit" aria-hidden="true" />
                    </button>
                </>
            )}
            {count > 1 && (
                <div className="hb-dots" role="tablist" aria-label="Choose game">
                    {games.map((game, dotIndex) => (
                        <button
                            key={game.id ?? dotIndex}
                            type="button"
                            role="tab"
                            aria-selected={dotIndex === activeIndex}
                            aria-label={`Show ${game.title}`}
                            className={`hb-dot${dotIndex === activeIndex ? " is-active" : ""}`}
                            onClick={() => setPosition(dotIndex)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
