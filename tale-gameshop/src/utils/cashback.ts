/**
 * Кэшбэк: уровни, проценты и пороги.
 *
 * Уровни задаёт админка (вкладка Cashback) и отдаёт сервер — `/api/cashback/program` публично и
 * `/api/account/cashback` вошедшему. Экраны берут их через useCashbackProgram / useCashbackStatus и
 * передают сюда: расчёты общие, таблица — одна, серверная. Разъехавшиеся проценты на витрине и в кабинете —
 * это прямое враньё покупателю о его выгоде.
 */

import i18n from '../i18n';

export type CashbackTier = {
    /** Ключ уровня — им же помечается текущий уровень покупателя. */
    id: string;
    name: string;
    /** Процент возврата с оплаченного заказа. */
    percent: number;
    /**
     * Сколько нужно потратить накопительно, чтобы уровень открылся. Стартовый уровень
     * порога не имеет — он у всех с первой покупки.
     */
    spendThreshold: number | null;
    /** Картинка уровня из медиатеки; нет — встроенная медаль по id или запасная. */
    imageUrl?: string | null;
};

/**
 * Запасная лестница — только пока ответ сервера не пришёл (или не пришёл вовсе). Совпадает с уровнями
 * по умолчанию на сервере (CashbackOptions.DefaultTiers), чтобы до ответа не мигало чужими цифрами.
 *
 * Порогов по числу отзывов здесь намеренно нет, хотя у конкурентов они есть: привязка денежного
 * вознаграждения к написанию отзывов — то, против чего направлены правило FTC 2024 года о фальшивых
 * отзывах и европейская Omnibus. Уровень зависит только от того, сколько человек потратил.
 */
export const CASHBACK_TIERS: CashbackTier[] = [
    { id: "rookie", name: "Rookie", percent: 3, spendThreshold: null },
    { id: "veteran", name: "Veteran", percent: 5, spendThreshold: 200 },
    { id: "elite", name: "Elite", percent: 7, spendThreshold: 1000 },
    { id: "legend", name: "Legend", percent: 10, spendThreshold: 3000 },
];

/** Английские названия уровней по умолчанию (CashbackOptions.DefaultTiers): только их и переводим. */
const DEFAULT_TIER_NAMES: Record<string, string> = { rookie: "Rookie", veteran: "Veteran", elite: "Elite", legend: "Legend" };

/**
 * Название уровня на языке сайта. Уровень, который админ назвал по-своему («Bronze»), показываем
 * как назван: словарь знает только встроенные имена.
 */
export const tierName = (tier: Pick<CashbackTier, "id" | "name">): string =>
    DEFAULT_TIER_NAMES[tier.id] === tier.name ? i18n.t("cashback.tiers." + tier.id, { defaultValue: tier.name }) : tier.name;

/** Уровень по накопленной сумме покупок. Ниже первого порога — стартовый. */
export const tierForSpend = (spent: number, tiers: CashbackTier[] = CASHBACK_TIERS): CashbackTier =>
    [...tiers]
        .reverse()
        .find((tier) => tier.spendThreshold !== null && spent >= tier.spendThreshold)
        ?? tiers[0];

/** Следующий уровень или null, если человек уже на верхнем. */
export const nextTierAfter = (tier: CashbackTier, tiers: CashbackTier[] = CASHBACK_TIERS): CashbackTier | null =>
    tiers[tiers.findIndex((item) => item.id === tier.id) + 1] ?? null;

export type CashbackProgress = {
    tier: CashbackTier;
    next: CashbackTier | null;
    /** Сколько ещё потратить до следующего уровня; null — уровень последний. */
    remaining: number | null;
    /** Доля пройденного пути до следующего уровня, 0…1. На верхнем уровне — 1. */
    ratio: number;
};

/**
 * Прогресс к следующему уровню.
 *
 * Отсчёт ведётся от порога текущего уровня, а не от нуля: иначе покупатель, только что
 * перешедший на Veteran (€200 из €1000), видел бы «20% пути», хотя прошёл ноль нового.
 */
export const cashbackProgress = (spent: number, tiers: CashbackTier[] = CASHBACK_TIERS): CashbackProgress => {
    const tier = tierForSpend(spent, tiers);
    const next = nextTierAfter(tier, tiers);

    if (!next || next.spendThreshold === null) {
        return { tier, next: null, remaining: null, ratio: 1 };
    }

    const floor = tier.spendThreshold ?? 0;
    const span = next.spendThreshold - floor;
    const done = Math.max(0, spent - floor);

    return {
        tier,
        next,
        remaining: Math.max(0, next.spendThreshold - spent),
        ratio: span > 0 ? Math.min(1, done / span) : 1,
    };
};

/** Сколько вернётся с заказа на эту сумму по текущему уровню. */
export const cashbackForOrder = (amount: number, tier: CashbackTier): number =>
    Math.max(0, Math.round(amount * tier.percent) / 100);

/** «3–10%», а при одном проценте на всех уровнях — просто «5%». */
export const percentRange = (tiers: CashbackTier[]): { min: number; max: number; text: string } => {
    const percents = tiers.map((tier) => tier.percent);
    const min = percents.length ? Math.min(...percents) : 0;
    const max = percents.length ? Math.max(...percents) : 0;
    return { min, max, text: min === max ? `${min}%` : `${min}–${max}%` };
};
