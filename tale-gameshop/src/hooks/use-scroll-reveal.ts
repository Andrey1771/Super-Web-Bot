import { useEffect } from "react";
import type { RefObject } from "react";

// Оживляет все элементы с классом .reveal внутри root: при попадании во вьюпорт
// добавляется .is-visible (анимация в effects.css). MutationObserver подхватывает
// контент, который приходит асинхронно (списки игр, блог и т.п.).
export default function useScrollReveal(rootRef: RefObject<HTMLElement | null>, deps: unknown[] = []) {
    useEffect(() => {
        // Браузер умеет scroll-driven animations → reveal целиком в CSS
        // (@supports-блок в effects.css), JS-наблюдатели не нужны вовсе.
        if (
            typeof CSS !== "undefined" &&
            typeof CSS.supports === "function" &&
            CSS.supports("animation-timeline: view()")
        ) {
            return;
        }

        const root = rootRef.current ?? document.body;

        const reduced =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const showAll = () => {
            root.querySelectorAll<HTMLElement>(".reveal:not(.is-visible)").forEach((el) => {
                el.classList.add("is-visible");
            });
        };

        if (reduced || typeof IntersectionObserver === "undefined") {
            showAll();
            return;
        }

        const io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        io.unobserve(entry.target);
                    }
                }
            },
            { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
        );

        const observeAll = () => {
            root.querySelectorAll<HTMLElement>(".reveal:not(.is-visible)").forEach((el) => io.observe(el));
        };

        observeAll();

        const mo = new MutationObserver(observeAll);
        // attributes: страховка — если React перезапишет class у .reveal-элемента
        // (динамический className) и сотрёт .is-visible, элемент попадёт под observeAll снова.
        mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

        return () => {
            io.disconnect();
            mo.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
