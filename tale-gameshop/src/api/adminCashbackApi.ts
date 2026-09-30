import { apiClient } from "./client";

/** Все суммы — в долларах: в них хранится баланс кэшбэка. */
export type CashbackOverview = {
  enabled: boolean;
  availableUsd: number;
  pendingUsd: number;
  reservedUsd: number;
  earnedAllTimeUsd: number;
  usedAllTimeUsd: number;
  customersWithBalance: number;
  /** Сколько магазин должен покупателям: доступное + ожидающее. */
  liabilityUsd: number;
};

export type AdminCashbackEntry = {
  id: string;
  type: "earn" | "reversal" | "spend" | "return" | "adjust" | string;
  status: string | null;
  amountUsd: number;
  orderId: string | null;
  orderNumber: string | null;
  gameTitle: string | null;
  percent: number | null;
  createdAt: string;
  unlocksAt: string | null;
  expiresAt: string | null;
  note: string | null;
  actor: string | null;
};

/** Поле настройки: действующее значение, значение из конфига и переопределено ли руками. */
export type CashbackSettingField<T> = { value: T; defaultValue: T | null; overridden: boolean };

/** Уровень кэшбэка: порог — накопленная сумма покупок в долларах. */
export type CashbackTierSetting = {
  id: string;
  name: string;
  percent: number;
  spendThresholdUsd: number;
  /** Картинка из медиатеки; null — встроенная медаль (у новых уровней — звезда). */
  imageUrl?: string | null;
};

export type CashbackSettingsView = {
  updatedAtUtc?: string | null;
  updatedBy?: string | null;
  enabled: CashbackSettingField<boolean>;
  pendingDays: CashbackSettingField<number>;
  expiryMonths: CashbackSettingField<number>;
  minCardPaymentUsd: CashbackSettingField<number>;
  emailNotices: CashbackSettingField<boolean>;
  expiryReminderDays: CashbackSettingField<number>;
  tiers: { value: CashbackTierSetting[]; defaultValue: CashbackTierSetting[]; overridden: boolean };
};

/** Полное состояние настроек кэшбэка; null в поле — «как в конфиге». */
export type CashbackSettingsPatch = {
  enabled?: boolean | null;
  pendingDays?: number | null;
  expiryMonths?: number | null;
  minCardPaymentUsd?: number | null;
  emailNotices?: boolean | null;
  expiryReminderDays?: number | null;
  /** Уровни целиком; null — вернуться к конфигу/дефолту. */
  tiers?: CashbackTierSetting[] | null;
};

export type AdminCashbackEmail = {
  /** available — «кэшбэк стал доступен», expiring — «скоро сгорит». */
  kind: "available" | "expiring" | string;
  sentAt: string;
  orderNumber: string | null;
  amountUsd: number | null;
  expiresAt: string | null;
};

export type AdminCashbackEmails = {
  /** Письма включены в настройках программы. */
  enabled: boolean;
  optedOut: boolean;
  optedOutAt: string | null;
  sent: AdminCashbackEmail[];
};

export type AdminCustomerCashback = {
  email: string;
  availableUsd: number;
  pendingUsd: number;
  reservedUsd: number;
  earnedAllTimeUsd: number;
  usedAllTimeUsd: number;
  expiredAllTimeUsd: number;
  forgivenAllTimeUsd: number;
  qualifyingSpendUsd: number;
  nextUnlockAt: string | null;
  tierName: string;
  tierPercent: number;
  entries: AdminCashbackEntry[];
  emails: AdminCashbackEmails;
};

const result = (response: { status: number; data?: { ok?: boolean; message?: string } }, fallback: string) => ({
  ok: response.status < 400 && response.data?.ok !== false,
  message: String(response.data?.message ?? (response.status >= 400 ? `Request failed (${response.status}).` : fallback)),
});

export const getCashbackSettings = async (): Promise<CashbackSettingsView> =>
  (await apiClient().get("/api/admin/cashback/settings")).data;

export const saveCashbackSettings = async (patch: CashbackSettingsPatch): Promise<{ ok: boolean; message: string }> =>
  result(await apiClient().put("/api/admin/cashback/settings", patch, { validateStatus: (s) => s < 500 }), "Saved.");

/** Снова присылать письма о кэшбэке отписавшемуся покупателю — только по его просьбе, с причиной. */
export const resumeCustomerCashbackEmails = async (email: string, reason: string): Promise<{ ok: boolean; message: string }> =>
  result(
    await apiClient().post(`/api/admin/cashback/customers/${encodeURIComponent(email)}/emails/resume`, { reason }, { validateStatus: (s) => s < 500 }),
    "Done."
  );

export const getCashbackOverview = async (): Promise<CashbackOverview> =>
  (await apiClient().get("/api/admin/cashback/overview")).data;

export const getCustomerCashback = async (email: string): Promise<AdminCustomerCashback> =>
  (await apiClient().get(`/api/admin/cashback/customers/${encodeURIComponent(email)}`)).data;

export const adjustCustomerCashback = async (email: string, amountUsd: number, reason: string): Promise<{ ok: boolean; message: string }> => {
  const response = await apiClient().post(
    `/api/admin/cashback/customers/${encodeURIComponent(email)}/adjust`,
    { amountUsd, reason },
    { validateStatus: (status) => status < 500 }
  );
  return { ok: Boolean(response.data?.ok), message: response.data?.message ?? "Adjustment failed." };
};
