import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

/** Поле настройки: действующее значение, значение из конфига и переопределено ли руками. */
export type SettingField<T> = { value: T; defaultValue: T | null; overridden: boolean };

export type SiteSettingsView = {
  updatedAtUtc?: string | null;
  updatedBy?: string | null;
  support: {
    businessHoursEnabled: SettingField<boolean>;
    businessHoursTimeZone: SettingField<string>;
    businessHoursStart: SettingField<number>;
    businessHoursEnd: SettingField<number>;
    expectedWaitMinutes: SettingField<number>;
    specialistEmail: SettingField<string | null>;
    notifyTelegramOnEscalation: SettingField<boolean>;
    notifyEmailOnEscalation: SettingField<boolean>;
    llmProvider: string;
    llmDailyBudgetUsd: SettingField<number>;
  };
  fx: {
    markupPercent: SettingField<number>;
    maxChangePercent: SettingField<number>;
  };
  rails: {
    card: { enabled: SettingField<boolean>; configured: boolean; hint: string };
    crypto: { enabled: SettingField<boolean>; configured: boolean; hint: string };
    stars: { enabled: SettingField<boolean>; configured: boolean; hint: string };
  };
};

/** Полное состояние оверлея; null в поле — «как в конфиге». */
export type SiteSettingsPatch = {
  businessHoursEnabled?: boolean | null;
  businessHoursTimeZone?: string | null;
  businessHoursStart?: number | null;
  businessHoursEnd?: number | null;
  expectedWaitMinutes?: number | null;
  specialistEmail?: string | null;
  llmDailyBudgetUsd?: number | null;
  notifyTelegramOnEscalation?: boolean | null;
  notifyEmailOnEscalation?: boolean | null;
  fxMarkupPercent?: number | null;
  fxMaxChangePercent?: number | null;
  cardEnabled?: boolean | null;
  cryptoEnabled?: boolean | null;
  starsEnabled?: boolean | null;
};

export const getSiteSettings = async (): Promise<SiteSettingsView> => (await apiClient().get("/api/admin/site-settings")).data;

export const saveSiteSettings = async (patch: SiteSettingsPatch): Promise<{ ok: boolean; message: string }> => {
  const response = await apiClient().put("/api/admin/site-settings", patch, { validateStatus: (s) => s < 500 });
  const data = response.data ?? {};
  return { ok: response.status < 400 && data.ok !== false, message: String(data.message ?? (response.status >= 400 ? `Request failed (${response.status}).` : "Saved.")) };
};
