import { injectable } from "inversify";
import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";
import type { IAdminAnalyticsService } from "../iterfaces/i-admin-analytics-service";
import type { AnalyticsOverview, AnalyticsSettings, AnalyticsConnectionStatus, AnalyticsProvider } from "../types/analytics";

@injectable()
export class AdminAnalyticsService implements IAdminAnalyticsService {
  private readonly _apiClient: IApiClient;

  constructor() {
    this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
  }

  async getSettings(): Promise<AnalyticsSettings> {
    const response = await this._apiClient.api.get(`/api/admin/analytics/settings`);
    return response.data as AnalyticsSettings;
  }

  async updateSettings(payload: AnalyticsSettings): Promise<AnalyticsSettings> {
    const response = await this._apiClient.api.put(`/api/admin/analytics/settings`, payload);
    return response.data as AnalyticsSettings;
  }

  async getConnectionStatus(): Promise<AnalyticsConnectionStatus> {
    const response = await this._apiClient.api.get(`/api/admin/analytics/status`);
    return response.data as AnalyticsConnectionStatus;
  }

  async testConnection(provider: AnalyticsProvider): Promise<{ status: AnalyticsConnectionStatus["ga4"] | AnalyticsConnectionStatus["yandex"] }>
  {
    const response = await this._apiClient.api.post(`/api/admin/analytics/test`, { provider });
    return response.data as { status: AnalyticsConnectionStatus["ga4"] | AnalyticsConnectionStatus["yandex"] };
  }

  async getOverview(provider: AnalyticsProvider, range: string): Promise<AnalyticsOverview> {
    const endpoint = provider === "ga4" ? "ga4" : "yandex";
    const response = await this._apiClient.api.get(`/api/admin/analytics/${endpoint}/overview?range=${range}`);
    return response.data as AnalyticsOverview;
  }
}
