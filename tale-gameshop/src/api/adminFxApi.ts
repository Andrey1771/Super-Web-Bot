import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export type FxRateRow = {
  currency: string;
  rate: number | null;
  capturedAt: string | null;
  rounding: string;
  manualOverride: number | null;
  /** Цена за 10 единиц базовой валюты после курса, наценки и округления — чтобы видеть, что получает покупатель. */
  samplePriceFor10: number | null;
};

export type FxOverview = {
  baseCurrency: string;
  supportedCurrencies: string[];
  markupPercent: number;
  maxChangePercent: number;
  roundingByCurrency: Record<string, string>;
  source: { configured: boolean; url?: string | null };
  rates: FxRateRow[];
};

export type FxHistoryPoint = { currency: string; rate: number; capturedAt: string };

export type FxOfferResult = {
  currency: string;
  rate: number;
  accepted: boolean;
  changePercent: number;
  reason?: string | null;
};

export const getFxOverview = async (): Promise<FxOverview> => (await apiClient().get("/api/admin/fx-rates")).data;

export const getFxHistory = async (currency: string, limit = 60): Promise<FxHistoryPoint[]> =>
  (await apiClient().get(`/api/admin/fx-rates/${encodeURIComponent(currency)}/history`, { params: { limit } })).data ?? [];

export const offerFxRates = async (rates: Record<string, number>, force = false): Promise<FxOfferResult[]> =>
  (await apiClient().post("/api/admin/fx-rates", { rates, force })).data ?? [];

export const importFxRatesNow = async (): Promise<{ updated: string[]; message: string }> => {
  const response = await apiClient().post("/api/admin/fx-rates/import", null, { validateStatus: (s) => s < 500 });
  return response.data ?? { updated: [], message: `Request failed (${response.status}).` };
};
