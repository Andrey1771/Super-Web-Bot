import { useEffect, useMemo, useState } from "react";
import { useKeycloak } from "@react-keycloak/web";
import { useSitePreferences } from "../context/site-preferences";
import { fetchAccountCashback, type AccountCashbackDto, type CashbackTierDto } from "../api/cashbackApi";
import { cashbackProgress, type CashbackTier } from "../utils/cashback";
import { useCashbackProgram } from "./use-cashback-program";

/**
 * Кэшбэк текущего покупателя — одно место для витрины, обзора кабинета и страницы кэшбэка.
 *
 * Данные — с сервера (`/api/account/cashback`), в валюте, выбранной на сайте. Гостю запрашивать
 * нечего: у него нули.
 *
 * Чтобы вёрстку можно было посмотреть с цифрами без настоящих заказов, есть демо-набор: он
 * включается только параметром `?demo=cashback` в адресе (и держится до закрытия вкладки,
 * `?demo=off` — выключить), а кабинет показывает пометку «Demo data». Без параметра его не
 * увидит никто. В демо витрина показывает вид вошедшего покупателя даже без входа.
 */

export type CashbackEntryStatus = AccountCashbackDto["history"][number]["status"];

export type CashbackEntry = {
    id: string;
    /** earn | reversal | spend | return | adjust. */
    type: AccountCashbackDto["history"][number]["type"];
    orderNumber: string;
    /** Игра заказа; у ручной правки — пусто. */
    gameTitle: string;
    /** Обложка; нет — SafeGameImage покажет заглушку. */
    imagePath: string | null;
    /** Дата записи, ISO. */
    date: string;
    /** Сумма заказа в его валюте (orderCurrency); у списания и правки — нет. */
    orderTotal: number | null;
    orderCurrency: string | null;
    /** Процент уровня на момент заказа; у списания — null. */
    percent: number | null;
    /** Плюс — пришло на баланс, минус — ушло. */
    amount: number;
    status: CashbackEntryStatus;
    /** Когда начисление станет доступным (только у pending), ISO. */
    unlocksAt?: string | null;
    /** Причина ручной правки. */
    note?: string | null;
};

export type CashbackStatus = {
    /** Keycloak ещё не ответил — не показываем ни гостя, ни покупателя, чтобы не мигать. */
    ready: boolean;
    signedIn: boolean;
    /** Данные из демо-набора, а не с сервера. */
    isDemo: boolean;
    /** Ответ сервера получен (у гостя и в демо — сразу true). */
    loaded: boolean;
    /** Не удалось загрузить — показываем нули, а не падаем. */
    error: boolean;
    /** Валюта сумм. Совпадает с валютой сайта, если для неё есть курс. */
    currency: string;
    /** Накопленная сумма оплаченных заказов — от неё зависит уровень. */
    totalSpent: number;
    /** Доступный к трате кэшбэк. */
    available: number;
    /** Начислено, но ещё ждёт конца окна возврата. */
    pending: number;
    /** Ближайшая дата, когда часть pending станет доступной, ISO; null — ждать нечего. */
    nextUnlockAt: string | null;
    /** Начислено за всё время, без возвращённого вместе с заказами. */
    earnedAllTime: number;
    /** Сколько кэшбэка уже потрачено на заказы. */
    usedAllTime: number;
    /** Новые записи сверху. */
    history: CashbackEntry[];
    /** Уровень и путь до следующего — с сервера, в той же валюте, что и суммы. */
    level: CashbackLevel;
};

export type CashbackLevel = {
    tierId: string;
    nextTierId: string | null;
    /** Сколько ещё потратить до следующего уровня; null — уровень последний. */
    remainingToNext: number | null;
    /** 0…1 — пройденная доля пути от порога текущего уровня до следующего. */
    progress: number;
    /** Все уровни с порогами в валюте сумм. */
    tiers: CashbackTierDto[];
};

type CashbackData = Pick<CashbackStatus, "currency" | "totalSpent" | "available" | "pending" | "nextUnlockAt" | "earnedAllTime" | "usedAllTime" | "history" | "level">;

/**
 * Уровень без счёта покупателя (гость, демо): по условиям программы с сервера — уровни и пороги в валюте сайта.
 * У вошедшего покупателя уровень всегда приходит с сервера вместе с балансом.
 */
const localLevel = (totalSpent: number, tiers: CashbackTier[]): CashbackLevel => {
    const { tier, next, remaining, ratio } = cashbackProgress(totalSpent, tiers);
    return {
        tierId: tier.id,
        nextTierId: next?.id ?? null,
        remainingToNext: remaining,
        progress: ratio,
        tiers: tiers.map((item) => ({ id: item.id, name: item.name, percent: item.percent, spendThreshold: item.spendThreshold, imageUrl: item.imageUrl ?? null })),
    };
};

const emptyData = (currency: string, tiers: CashbackTier[]): CashbackData => ({
    currency,
    totalSpent: 0,
    available: 0,
    pending: 0,
    nextUnlockAt: null,
    earnedAllTime: 0,
    usedAllTime: 0,
    history: [],
    level: localLevel(0, tiers),
});

/**
 * Демо-покупатель уровня Veteran. Цифры сходятся между собой: процент — по уровню на момент
 * заказа, возвращённый заказ не входит ни в сумму покупок, ни в начисленное.
 */
const demo = (row: Omit<CashbackEntry, "type" | "orderCurrency"> & Partial<Pick<CashbackEntry, "type">>): CashbackEntry => ({
    type: row.amount < 0 ? "spend" : "earn",
    orderCurrency: "USD",
    ...row,
});

const DEMO_HISTORY: CashbackEntry[] = [
    demo({ id: "d8", orderNumber: "TS-10482", gameTitle: "Sekiro: Shadows Die Twice", imagePath: null, date: "2026-09-10", orderTotal: 41.2, percent: 5, amount: 2.06, status: "pending", unlocksAt: "2026-09-24" }),
    demo({ id: "d7b", orderNumber: "TS-10455", gameTitle: "Hades II", imagePath: null, date: "2026-09-05", orderTotal: 24.99, percent: 5, amount: 1.25, status: "available" }),
    demo({ id: "d7", orderNumber: "TS-10455", gameTitle: "Hades II", imagePath: null, date: "2026-09-05", orderTotal: 24.99, percent: null, amount: -5, status: "spent" }),
    demo({ id: "d6", orderNumber: "TS-10391", gameTitle: "Hogwarts Legacy", imagePath: null, date: "2026-08-29", orderTotal: 59.99, percent: 5, amount: 3, status: "available" }),
    demo({ id: "d5", orderNumber: "TS-10340", gameTitle: "Palworld", imagePath: null, date: "2026-08-20", orderTotal: 29.99, percent: 5, amount: 1.5, status: "reverted" }),
    demo({ id: "d4", orderNumber: "TS-10302", gameTitle: "Starfield", imagePath: null, date: "2026-08-14", orderTotal: 99.98, percent: 5, amount: 5, status: "available" }),
    demo({ id: "d3", orderNumber: "TS-10217", gameTitle: "Red Dead Redemption 2: Ultimate Edition", imagePath: null, date: "2026-07-30", orderTotal: 89.99, percent: 3, amount: 2.7, status: "available" }),
    demo({ id: "d2", orderNumber: "TS-10166", gameTitle: "Elden Ring", imagePath: null, date: "2026-07-08", orderTotal: 59.99, percent: 3, amount: 1.8, status: "available" }),
    demo({ id: "d1", orderNumber: "TS-10104", gameTitle: "Baldur's Gate 3", imagePath: null, date: "2026-06-21", orderTotal: 59.99, percent: 3, amount: 1.8, status: "available" }),
];

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Сводка для демо-набора: так же, как её считает сервер, чтобы цифры в демо не расходились. */
export const summarizeCashback = (history: CashbackEntry[]) => {
    const sum = (status: CashbackEntryStatus) =>
        round2(history.filter((entry) => entry.status === status).reduce((acc, entry) => acc + entry.amount, 0));
    const earned = round2(
        history
            .filter((entry) => entry.amount > 0 && entry.status !== "reverted")
            .reduce((acc, entry) => acc + entry.amount, 0)
    );
    const used = round2(-sum("spent"));
    const unlocks = history
        .filter((entry) => entry.status === "pending" && entry.unlocksAt)
        .map((entry) => entry.unlocksAt as string)
        .sort();

    return {
        // Сумма покупок — по начислениям: у каждого оплаченного заказа оно одно. Списание
        // относится к тому же заказу, поэтому второй раз его не считаем.
        totalSpent: round2(
            history
                .filter((entry) => entry.status !== "reverted" && entry.percent !== null)
                .reduce((acc, entry) => acc + (entry.orderTotal ?? 0), 0)
        ),
        available: round2(sum("available") - used),
        pending: sum("pending"),
        nextUnlockAt: unlocks[0] ?? null,
        earnedAllTime: earned,
        usedAllTime: used,
    };
};

export const isCashbackDemo = (search: string) => new URLSearchParams(search).get("demo") === "cashback";

const DEMO_KEY = "taleshop:cashback-demo";

/**
 * Демо живёт до закрытия вкладки: иначе оно пропадало бы при первом же переходе из корзины
 * в оформление. `?demo=off` выключает его сразу.
 */
const readDemoFlag = (): boolean => {
    if (typeof window === "undefined") {
        return false;
    }
    try {
        const param = new URLSearchParams(window.location.search).get("demo");
        if (param === "cashback") {
            window.sessionStorage.setItem(DEMO_KEY, "1");
        } else if (param === "off") {
            window.sessionStorage.removeItem(DEMO_KEY);
        }
        return window.sessionStorage.getItem(DEMO_KEY) === "1";
    } catch {
        return isCashbackDemo(window.location.search);
    }
};

// Адрес, с которым открыли сайт, — даже если на первой странице кэшбэка нет вовсе.
readDemoFlag();

/**
 * Один запрос на всю страницу: хук стоит сразу в нескольких местах (плашка у цены, строка в итоге,
 * карточка в кабинете), и без общего кэша каждое место спрашивало бы сервер отдельно.
 * Запись живёт минуту; после оплаты кэш сбрасывается через refreshCashbackStatus().
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; promise: Promise<CashbackData> }>();
const listeners = new Set<() => void>();

const toData = (dto: AccountCashbackDto): CashbackData => ({
    currency: dto.currency,
    totalSpent: dto.totalSpent,
    available: dto.available,
    pending: dto.pending,
    nextUnlockAt: dto.nextUnlockAt,
    earnedAllTime: dto.earnedAllTime,
    usedAllTime: dto.usedAllTime,
    level: {
        tierId: dto.tier.id,
        nextTierId: dto.nextTier?.id ?? null,
        remainingToNext: dto.remainingToNextTier,
        progress: dto.progress,
        tiers: dto.tiers,
    },
    history: dto.history.map((row) => ({
        id: row.id,
        type: row.type,
        orderNumber: row.orderNumber ?? "",
        gameTitle: row.gameTitle ?? "",
        imagePath: row.imagePath,
        date: row.date,
        orderTotal: row.orderTotal,
        orderCurrency: row.orderCurrency,
        percent: row.percent,
        amount: row.amount,
        status: row.status,
        unlocksAt: row.unlocksAt,
        note: row.note,
    })),
});

const loadCashback = (currency: string): Promise<CashbackData> => {
    const cached = cache.get(currency);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.promise;
    }
    const promise = fetchAccountCashback(currency).then(toData);
    cache.set(currency, { at: Date.now(), promise });
    // Неудачный запрос в кэше не держим — следующий показ попробует снова.
    promise.catch(() => cache.delete(currency));
    return promise;
};

/** Сбросить кэш и перечитать баланс везде, где он показан (например, после оплаты). */
export const refreshCashbackStatus = () => {
    cache.clear();
    listeners.forEach((listener) => listener());
};

export const useCashbackStatus = (): CashbackStatus => {
    const { keycloak, initialized } = useKeycloak();
    const { currency } = useSitePreferences();
    const signedIn = Boolean(initialized && keycloak.authenticated);
    const isDemo = readDemoFlag();
    const { tiers } = useCashbackProgram();

    const [data, setData] = useState<CashbackData | null>(null);
    const [error, setError] = useState(false);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        const listener = () => setVersion((value) => value + 1);
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }, []);

    useEffect(() => {
        if (isDemo || !signedIn) {
            return;
        }
        let active = true;
        setError(false);
        loadCashback(currency)
            .then((next) => {
                if (active) {
                    setData(next);
                }
            })
            .catch(() => {
                if (active) {
                    setError(true);
                    setData(null);
                }
            });
        return () => {
            active = false;
        };
    }, [currency, isDemo, signedIn, version]);

    return useMemo(() => {
        if (isDemo) {
            return {
                ready: true,
                signedIn,
                isDemo,
                loaded: true,
                error: false,
                ...emptyData(currency, tiers),
                ...summarizeCashback(DEMO_HISTORY),
                history: DEMO_HISTORY,
                level: localLevel(summarizeCashback(DEMO_HISTORY).totalSpent, tiers),
            };
        }
        const server = signedIn ? data : null;
        return {
            ready: initialized,
            signedIn,
            isDemo,
            loaded: !signedIn || server !== null || error,
            error,
            ...(server ?? emptyData(currency, tiers)),
        };
    }, [currency, data, error, initialized, isDemo, signedIn, tiers]);
};
