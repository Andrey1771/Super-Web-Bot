import { apiClient } from "./client";

/** Отписка от писем о кэшбэке по подписанной ссылке из письма; вход не нужен. */
export const unsubscribeCashbackNotices = async (token: string): Promise<void> => {
  await apiClient().post("/api/cashback/notices/unsubscribe", { token });
};

export type CashbackTierDto = {
    id: string;
    name: string;
    percent: number;
    /** С какой суммы покупок открывается; null — с первого заказа. */
    spendThreshold: number | null;
    /** Картинка уровня из медиатеки; null — встроенная медаль (или запасная у новых уровней). */
    imageUrl?: string | null;
};

/** Условия программы — публично, без входа: страница /rewards и подсказки в корзине. */
export type CashbackProgramDto = {
    enabled: boolean;
    /** Валюта порогов и минимума. Если курса для запрошенной нет — USD. */
    currency: string;
    pendingDays: number;
    expiryMonths: number;
    minCardPayment: number;
    /** Шлём ли письма о доступном и сгорающем кэшбэке. */
    emailNotices: boolean;
    /** За сколько дней до сгорания напоминаем; 0 — не напоминаем. */
    expiryReminderDays: number;
    tiers: CashbackTierDto[];
};

export const fetchCashbackProgram = async (currency: string): Promise<CashbackProgramDto> => {
    const response = await apiClient().get("/api/cashback/program", { params: { currency } });
    return response.data as CashbackProgramDto;
};

export type CashbackHistoryRowDto = {
    id: string;
    type: "earn" | "reversal" | "spend" | "return" | "adjust";
    orderNumber: string | null;
    gameTitle: string | null;
    imagePath: string | null;
    date: string;
    orderTotal: number | null;
    orderCurrency: string | null;
    percent: number | null;
    amount: number;
    status: "pending" | "available" | "spent" | "expired" | "reverted" | "returned" | "adjusted";
    unlocksAt: string | null;
    note: string | null;
};

export type AccountCashbackDto = {
    enabled: boolean;
    /** Валюта всех сумм ответа. Если курса для запрошенной нет — USD. */
    currency: string;
    available: number;
    pending: number;
    reserved: number;
    nextUnlockAt: string | null;
    earnedAllTime: number;
    usedAllTime: number;
    totalSpent: number;
    tier: CashbackTierDto;
    nextTier: CashbackTierDto | null;
    remainingToNextTier: number | null;
    /** 0…1 — пройденная доля пути до следующего уровня. */
    progress: number;
    /** Все уровни с порогами в валюте ответа. */
    tiers: CashbackTierDto[];
    history: CashbackHistoryRowDto[];
};

export const fetchAccountCashback = async (currency: string): Promise<AccountCashbackDto> => {
    const response = await apiClient().get("/api/account/cashback", { params: { currency } });
    return response.data as AccountCashbackDto;
};
