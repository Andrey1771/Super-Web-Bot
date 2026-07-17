import React, { useEffect, useRef, useState } from "react";

interface CountUpProps {
    value: number;
    duration?: number;
    prefix?: string;
    suffix?: string;
}

// Число «набегает» от 0 до value, когда элемент попадает во вьюпорт.
// При prefers-reduced-motion показывает конечное значение сразу.
const CountUp: React.FC<CountUpProps> = ({ value, duration = 900, prefix = "", suffix = "" }) => {
    const [display, setDisplay] = useState(0);
    const ref = useRef<HTMLSpanElement | null>(null);
    const started = useRef(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) {
            return;
        }

        const reduced =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (reduced || typeof IntersectionObserver === "undefined") {
            setDisplay(value);
            return;
        }

        const io = new IntersectionObserver(
            (entries) => {
                if (started.current || !entries.some((entry) => entry.isIntersecting)) {
                    return;
                }
                started.current = true;
                io.disconnect();

                const start = performance.now();
                const tick = (now: number) => {
                    const t = Math.min(1, (now - start) / duration);
                    const eased = 1 - Math.pow(1 - t, 3);
                    setDisplay(Math.round(value * eased));
                    if (t < 1) {
                        requestAnimationFrame(tick);
                    }
                };
                requestAnimationFrame(tick);
            },
            { threshold: 0.4 }
        );

        io.observe(el);
        return () => io.disconnect();
    }, [duration, value]);

    return (
        <span ref={ref}>
            {prefix}
            {display.toLocaleString("en-US")}
            {suffix}
        </span>
    );
};

export default CountUp;
