import { useEffect, useRef, useState } from "react";

/**
 * «Блок доехал до экрана» — один раз, без отката обратно.
 *
 * Анимации страницы кэшбэка стартуют не при загрузке, а когда до блока докрутили: иначе
 * чек, который сам себя заполняет, отыграет где-то внизу, пока человек читает шапку.
 *
 * Без IntersectionObserver (старый браузер, jsdom в тестах) и при prefers-reduced-motion
 * блок сразу считается показанным — содержимое никогда не остаётся спрятанным.
 */
export function useReveal<T extends HTMLElement>(threshold = 0.2) {
    const ref = useRef<T | null>(null);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) {
            return;
        }

        const reduced =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (reduced || typeof IntersectionObserver === "undefined") {
            setShown(true);
            return;
        }

        const io = new IntersectionObserver(
            (entries) => {
                // Блок уже выше экрана (перезагрузка посреди страницы) — тоже показываем,
                // иначе при прокрутке вверх он встретит человека пустым местом.
                const done = entries.some(
                    (entry) => entry.isIntersecting || entry.boundingClientRect.bottom < 0
                );
                if (done) {
                    setShown(true);
                    io.disconnect();
                }
            },
            { threshold, rootMargin: "0px 0px -8% 0px" }
        );

        io.observe(el);
        return () => io.disconnect();
    }, [threshold]);

    return [ref, shown] as const;
}
