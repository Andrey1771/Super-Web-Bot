import { useTranslation } from "react-i18next";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faStar } from "@fortawesome/free-solid-svg-icons";
import type { SiteReviewQuote } from "../../api/reviewsApi";

/**
 * Лента свежих отзывов на странице «О нас».
 *
 * Сделана прокруткой со снапом, а не сдвигом ленты через transform, как карусель на главной.
 * Там слайд один и во всю ширину — там transform уместен. Здесь карточек видно две на широком
 * экране и одна на узком, высота у них разная, и считать это руками значит держать в JS то,
 * что CSS знает и так. Заодно бесплатно работают колесо, тачпад, свайп и клавиатура.
 *
 * Автопрокрутка останавливается на наведении, на фокусе с клавиатуры и на касании: листать
 * из-под руки читающего — худшее, что карусель может сделать.
 */

/**
 * Кружок автора: аватар, а если его нет или ссылка битая — первая буква имени. Битая
 * ссылка тут не редкость: человек мог сменить аватар или удалить его после отзыва, а
 * адрес остался записанным в самом отзыве. Сломанная иконка с alt-текстом на её месте
 * выглядела бы поломкой витрины.
 */
const QuoteAvatar: React.FC<{ author: string; url: string | null }> = ({ author, url }) => {
    const [broken, setBroken] = useState(false);

    if (!url || broken) {
        return (
            <span className="about-quote-avatar" aria-hidden="true">
                {(author || "?").trim().charAt(0).toUpperCase()}
            </span>
        );
    }

    return (
        <span className="about-quote-avatar">
            <img src={url} alt={author} loading="lazy" onError={() => setBroken(true)}/>
        </span>
    );
};

const AUTOPLAY_MS = 7000;

/** Запас у краёв ленты: боковой отступ ленты плюс дробные размеры на масштабированных экранах. */
const EDGE_SLACK_PX = 8;

type Props = {
    quotes: SiteReviewQuote[];
};

const prefersReducedMotion = () =>
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Позиции карточек внутри ленты — по их прямоугольникам, а не по offsetLeft.
 *
 * offsetLeft считается от offsetParent, а у ленты нет position, поэтому её offsetParent —
 * body, и в число попадают отступы всей страницы. Расхождение было 16px: прокрутка уезжала
 * мимо снапа, ближайшая карточка определялась неверно, и лента вставала намертво.
 * Через getBoundingClientRect это не зависит ни от какого позиционирования выше.
 */
const cardOffsets = (track: HTMLElement): number[] => {
    const base = track.getBoundingClientRect().left;
    return Array.from(track.children).map(
        (card) => (card as HTMLElement).getBoundingClientRect().left - base + track.scrollLeft
    );
};

export default function ReviewsCarousel({ quotes }: Props) {
    const { t } = useTranslation();
    const trackRef = useRef<HTMLDivElement | null>(null);
    const pausedRef = useRef(false);
    const [active, setActive] = useState(0);
    const [atStart, setAtStart] = useState(true);
    const [atEnd, setAtEnd] = useState(false);

    /** Куда доехали: индекс карточки, ближайшей к левому краю окна прокрутки. */
    const syncPosition = useCallback(() => {
        const track = trackRef.current;
        if (!track) {
            return;
        }
        const nearest = cardOffsets(track).reduce(
            (best, left, index) => {
                const distance = Math.abs(left - track.scrollLeft);
                return distance < best.distance ? { index, distance } : best;
            },
            { index: 0, distance: Number.POSITIVE_INFINITY }
        );

        // Значения ставим только когда они изменились: во время плавной прокрутки события
        // сыплются каждый кадр, и перерисовка на каждом из них — лишняя работа на ровном месте.
        setActive((prev) => (prev === nearest.index ? prev : nearest.index));
        // Запас в несколько пикселей: у ленты есть боковой отступ, а scrollWidth на
        // масштабированных экранах дробный — точного равенства не бывает.
        setAtStart((prev) => { const value = track.scrollLeft <= EDGE_SLACK_PX; return prev === value ? prev : value; });
        setAtEnd((prev) => {
            const value = track.scrollLeft + track.clientWidth >= track.scrollWidth - EDGE_SLACK_PX;
            return prev === value ? prev : value;
        });
    }, []);

    // Событий прокрутки много, кадров — 60 в секунду. Считаем не чаще кадра.
    const scrollFrameRef = useRef<number | null>(null);
    const handleScroll = useCallback(() => {
        if (scrollFrameRef.current !== null) {
            return;
        }
        scrollFrameRef.current = requestAnimationFrame(() => {
            scrollFrameRef.current = null;
            syncPosition();
        });
    }, [syncPosition]);

    useEffect(() => () => {
        if (scrollFrameRef.current !== null) {
            cancelAnimationFrame(scrollFrameRef.current);
        }
    }, []);

    useEffect(() => {
        syncPosition();
        // quotes.length, а не сам массив: у него новая ссылка на каждый рендер родителя,
        // и эффект срабатывал бы вхолостую постоянно.
    }, [quotes.length, syncPosition]);

    /** Прокрутка к карточке по индексу. Индекс за пределами ленты сворачивается к краю. */
    const goTo = useCallback((index: number) => {
        const track = trackRef.current;
        if (!track) {
            return;
        }
        const offsets = cardOffsets(track);
        if (offsets.length === 0) {
            return;
        }
        const left = offsets[Math.max(0, Math.min(offsets.length - 1, index))];
        track.scrollTo({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }, []);

    const step = useCallback((direction: 1 | -1) => {
        goTo(active + direction);
    }, [active, goTo]);

    // Автопрокрутка. Дойдя до конца, возвращается в начало: кольцевую ленту тут городить
    // незачем — отзывов десяток, и «вернулись к первому» читается нормально.
    useEffect(() => {
        if (quotes.length <= 1 || prefersReducedMotion()) {
            return;
        }
        const id = window.setInterval(() => {
            if (pausedRef.current) {
                return;
            }
            const track = trackRef.current;
            if (!track) {
                return;
            }
            const done = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
            goTo(done ? 0 : active + 1);
        }, AUTOPLAY_MS);
        return () => window.clearInterval(id);
    }, [quotes.length, active, goTo]);

    if (quotes.length === 0) {
        return null;
    }

    const pause = () => { pausedRef.current = true; };
    const resume = () => { pausedRef.current = false; };

    return (
        <div
            className="about-voices-carousel"
            role="group"
            aria-roledescription="carousel"
            aria-label={t("about.recentReviews")}
            onMouseEnter={pause}
            onMouseLeave={resume}
            onFocusCapture={pause}
            onBlurCapture={resume}
            onTouchStart={pause}
            onTouchEnd={resume}
        >
            {/* Обёртка нужна для позиционирования стрелок: они прижаты к краям самой ленты,
                а не к блоку целиком — иначе они уехали бы к точкам вниз. */}
            <div className="about-voices-viewport">
            {quotes.length > 1 && (
                <button
                    type="button"
                    className="about-voices-arrow is-prev"
                    onClick={() => step(-1)}
                    disabled={atStart}
                    aria-label={t("about.previousReviews")}
                >
                    <FontAwesomeIcon icon={faChevronLeft} />
                </button>
            )}
            {/* Затухание включаем только с той стороны, где лента действительно продолжается:
                в начале списка мылить левый край незачем — там ничего не обрезано. */}
            <div
                className={`about-quotes${atStart ? "" : " is-fade-start"}${atEnd ? "" : " is-fade-end"}`}
                ref={trackRef}
                onScroll={handleScroll}
                tabIndex={0}
            >
                {quotes.map((quote) => (
                    <figure key={`${quote.author}-${quote.createdAt}`} className="about-quote">
                        <div className="about-quote-head">
                            {/* За цитатой должен стоять человек, а не абзац текста: аватар,
                                а без него — первая буква имени. Тот же приём, что у карточек
                                команды и у отзывов на странице игры. */}
                            <QuoteAvatar author={quote.author} url={quote.avatarUrl} />
                            <div className="about-quote-who">
                                <span className="about-quote-author">{quote.author}</span>
                                {/* Оценка и игра — одной строкой под именем. Раньше игра стояла в
                                    подвале за разделителем, и в карточке с коротким отзывом между
                                    текстом и подвалом зияла пустая полоса в полкарточки. */}
                                <span className="about-quote-meta">
                                    <span className="about-quote-stars" role="img" aria-label={t("about.outOf5", { rating: quote.rating })}>
                                        {Array.from({ length: 5 }).map((_, index) => (
                                            <FontAwesomeIcon
                                                key={index}
                                                icon={faStar}
                                                className={index < quote.rating ? "is-on" : "is-off"}
                                            />
                                        ))}
                                    </span>
                                    {quote.gameSlug && quote.gameTitle && (
                                        <>
                                            <span className="about-quote-dot" aria-hidden="true">·</span>
                                            <Link className="about-quote-game" to={`/games/${quote.gameSlug}`}>
                                                {quote.gameTitle}
                                            </Link>
                                        </>
                                    )}
                                </span>
                            </div>
                        </div>
                        <blockquote className="about-quote-text">“{quote.text}”</blockquote>
                    </figure>
                ))}
            </div>
            {quotes.length > 1 && (
                <button
                    type="button"
                    className="about-voices-arrow is-next"
                    onClick={() => step(1)}
                    disabled={atEnd}
                    aria-label={t("about.nextReviews")}
                >
                    <FontAwesomeIcon icon={faChevronRight} />
                </button>
            )}
            </div>

            {/* Точки — и указатель места, и переход. Их столько же, сколько отзывов:
                видимых карточек может быть две, но прокрутка идёт по одной. */}
            {quotes.length > 1 && (
                <div className="about-voices-dots">
                    {quotes.map((quote, index) => (
                        <button
                            key={`${quote.author}-${quote.createdAt}-dot`}
                            type="button"
                            className={`about-voices-dot${index === active ? " is-active" : ""}`}
                            onClick={() => goTo(index)}
                            aria-label={t("about.reviewNof", { index: index + 1, count: quotes.length })}
                            aria-current={index === active}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
