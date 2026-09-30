import { useEffect, useState } from "react";

/**
 * «Анимация появления отыграла» — через заданное время после старта.
 *
 * После этого с элементов снимается анимация появления (класс is-settled в CSS). Зачем:
 * полностраничные скриншотилки и расширения перезапускают CSS-анимации в момент съёмки, и
 * всё, что появляется с задержкой, на кадре снова прозрачное — шапка кэшбэка выходила
 * пустой. Отыгравшая и снятая анимация перезапуститься не может.
 *
 * `start` — когда отсчёт начинается (например, блок доехал до экрана).
 */
export function useSettled(start: boolean, afterMs: number) {
    const [settled, setSettled] = useState(false);

    useEffect(() => {
        if (!start || settled) {
            return;
        }
        const timer = window.setTimeout(() => setSettled(true), afterMs);
        return () => window.clearTimeout(timer);
    }, [start, settled, afterMs]);

    return settled;
}
