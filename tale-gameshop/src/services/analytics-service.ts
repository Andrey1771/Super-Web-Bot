import { injectable } from "inversify";
import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";
import type { IAnalyticsService } from "../iterfaces/i-analytics-service";
import type { AnalyticsPublicSettings } from "../types/analytics";

@injectable()
export class AnalyticsService implements IAnalyticsService {
  private readonly _apiClient: IApiClient;

  constructor() {
    this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
  }

  async getPublicSettings(): Promise<AnalyticsPublicSettings> {
    const response = await this._apiClient.api.get(`/api/analytics/settings`);
    return response.data as AnalyticsPublicSettings;
  }
}
