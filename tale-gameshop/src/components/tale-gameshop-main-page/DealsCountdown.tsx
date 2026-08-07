import React, { useEffect, useState } from "react";

export interface CountdownParts {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
}

// Живой отсчёт до срока (тик раз в секунду). null — срок не задан/не парсится/уже прошёл:
// вызывающий в этом случае просто ничего не рисует, данные обновятся при следующей загрузке.
export function useCountdown(endsAt?: string): CountdownParts | null {
    const target = endsAt ? Date.parse(endsAt) : NaN;
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    if (Number.isNaN(target) || target <= now) {
        return null;
    }

    const totalSeconds = Math.floor((target - now) / 1000);
    return {
        days: Math.floor(totalSeconds / 86400),
        hours: Math.floor((totalSeconds % 86400) / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60
    };
}

export const padCountdown = (value: number): string => String(value).padStart(2, "0");

// Компактный чип «Ends in …» в шапке полки дилов.
export default function DealsCountdown({ endsAt }: { endsAt?: string }) {
    const countdown = useCountdown(endsAt);
    if (!countdown) {
        return null;
    }

    const { days, hours, minutes, seconds } = countdown;
    return (
        <span className="shelf-countdown" title="Nearest deal expires">
            Ends in {days > 0 ? `${days}d ` : ""}{padCountdown(hours)}:{padCountdown(minutes)}:{padCountdown(seconds)}
        </span>
    );
}
