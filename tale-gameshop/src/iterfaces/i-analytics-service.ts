import type { AnalyticsPublicSettings } from "../types/analytics";

export interface IAnalyticsService {
  getPublicSettings(): Promise<AnalyticsPublicSettings>;
}
