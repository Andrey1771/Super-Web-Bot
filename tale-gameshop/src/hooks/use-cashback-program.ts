import { useEffect, useState } from "react";
import { useSitePreferences } from "../context/site-preferences";
import { fetchCashbackProgram, type CashbackProgramDto } from "../api/cashbackApi";
import { CASHBACK_TIERS, type CashbackTier } from "../utils/cashback";

/**
 * Условия программы кэшбэка для витрины: уровни (с порогами в валюте сайта и картинками), сроки, минимум.
 *
 * Их меняет админка, поэтому публичная страница и подсказки в корзине берут их с сервера, а не из кода.
 * Пока ответа нет (или сервер не ответил) — запасные значения, совпадающие с серверными по умолчанию.
 */

export type CashbackProgram = {
    /** Ответ сервера получен. */
    loaded: boolean;
    enabled: boolean;
    currency: string;
    pendingDays: number;
    expiryMonths: number;
    minCardPayment: number;
    emailNotices: boolean;
    expiryReminderDays: number;
    /** По возрастанию порога; первый — с первого заказа. Никогда не пуст. */
    tiers: CashbackTier[];
};

const FALLBACK = (currency: string): CashbackProgram => ({
    loaded: false,
    enabled: true,
    currency,
    pendingDays: 14,
    expiryMonths: 12,
    minCardPayment: 1,
    emailNotices: true,
    expiryReminderDays: 30,
    tiers: CASHBACK_TIERS,
});

/** Минута: условия меняются редко, а хук стоит сразу в нескольких блоках страницы. */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; promise: Promise<CashbackProgramDto> }>();

const load = (currency: string): Promise<CashbackProgramDto> => {
    const cached = cache.get(currency);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.promise;
    }
    const promise = fetchCashbackProgram(currency);
    cache.set(currency, { at: Date.now(), promise });
    promise.catch(() => cache.delete(currency));
    return promise;
};

const toProgram = (dto: CashbackProgramDto): CashbackProgram => ({
    loaded: true,
    enabled: dto.enabled,
    currency: dto.currency,
    pendingDays: dto.pendingDays,
    expiryMonths: dto.expiryMonths,
    minCardPayment: dto.minCardPayment,
    emailNotices: dto.emailNotices ?? true,
    expiryReminderDays: dto.expiryReminderDays ?? 0,
    tiers: dto.tiers.length > 0
        ? dto.tiers.map((tier) => ({ id: tier.id, name: tier.name, percent: tier.percent, spendThreshold: tier.spendThreshold, imageUrl: tier.imageUrl ?? null }))
        : CASHBACK_TIERS,
});

export const useCashbackProgram = (): CashbackProgram => {
    const { currency } = useSitePreferences();
    const [program, setProgram] = useState<CashbackProgram>(() => FALLBACK(currency));

    useEffect(() => {
        let active = true;
        load(currency)
            .then((dto) => {
                if (active) {
                    setProgram(toProgram(dto));
                }
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [currency]);

    return program;
};
