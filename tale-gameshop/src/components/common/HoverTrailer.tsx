import React, { useEffect, useRef, useState } from 'react';
import './hover-trailer.css';

interface HoverTrailerProps {
    /** Адрес ролика; нет — компонент ничего не рисует и не слушает. */
    src?: string | null;
    poster?: string | null;
    title?: string | null;
    /** Сколько держать мышь на карточке, прежде чем запускать видео: простой проезд мышью ролик не дёргает. */
    delayMs?: number;
}

export const HOVER_TRAILER_DELAY_MS = 450;

/**
 * Можно ли вообще показывать превью: только устройства с мышью (на телефонах наведения нет), без
 * системной просьбы «меньше движения» и не в режиме экономии трафика.
 */
export const hoverTrailerAllowed = (): boolean => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        return false;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return false;
    }
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return !connection?.saveData;
};

/**
 * Превью-ролик при наведении на плитку товара, как у Steam и Epic.
 *
 * Слушает наведение на ближайшую карточку (article), а не на себя: рамка обложки под ссылкой, и события до неё
 * не доходят. Ролик грузится только по наведению (preload="none"), без звука, по кругу; уход мыши убирает его и
 * возвращает обложку. Ничего не делает там, где наведения нет или движение нежелательно.
 */
const HoverTrailer: React.FC<HoverTrailerProps> = ({ src, poster, title, delayMs = HOVER_TRAILER_DELAY_MS }) => {
    const anchorRef = useRef<HTMLSpanElement | null>(null);
    const [active, setActive] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!src || !hoverTrailerAllowed()) {
            return;
        }
        const card = anchorRef.current?.closest('article, [data-hover-trailer-root]');
        if (!card) {
            return;
        }
        let timer: number | null = null;
        const enter = () => {
            timer = window.setTimeout(() => setActive(true), delayMs);
        };
        const leave = () => {
            if (timer !== null) {
                window.clearTimeout(timer);
                timer = null;
            }
            setActive(false);
            setReady(false);
        };
        card.addEventListener('pointerenter', enter);
        card.addEventListener('pointerleave', leave);
        return () => {
            card.removeEventListener('pointerenter', enter);
            card.removeEventListener('pointerleave', leave);
            if (timer !== null) {
                window.clearTimeout(timer);
            }
        };
    }, [src, delayMs]);

    if (!src) {
        return null;
    }

    return (
        <span ref={anchorRef} className="hover-trailer-anchor" aria-hidden="true">
            {active && (
                <video
                    className={`hover-trailer${ready ? ' is-ready' : ''}`}
                    src={src}
                    poster={poster ?? undefined}
                    muted
                    loop
                    playsInline
                    autoPlay
                    preload="none"
                    disablePictureInPicture
                    onPlaying={() => setReady(true)}
                    onError={() => setActive(false)}
                    data-testid="hover-trailer"
                    title={title ? `${title} trailer` : undefined}
                />
            )}
        </span>
    );
};

export default HoverTrailer;
