import type { AnalyticsConnectionStatus, AnalyticsOverview, AnalyticsProvider, AnalyticsSettings } from "../types/analytics";

export interface IAdminAnalyticsService {
  getSettings(): Promise<AnalyticsSettings>;
  updateSettings(payload: AnalyticsSettings): Promise<AnalyticsSettings>;
  getConnectionStatus(): Promise<AnalyticsConnectionStatus>;
  testConnection(provider: AnalyticsProvider): Promise<{ status: AnalyticsConnectionStatus["ga4"] | AnalyticsConnectionStatus["yandex"] }>;
  getOverview(provider: AnalyticsProvider, range: string): Promise<AnalyticsOverview>;
}
