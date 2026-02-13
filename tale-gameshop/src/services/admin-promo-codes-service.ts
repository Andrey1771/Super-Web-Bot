import { injectable } from 'inversify';
import IDENTIFIERS from '../constants/identifiers';
import container from '../inversify.config';
import type { IApiClient } from '../iterfaces/i-api-client';
import type { IAdminPromoCodesService } from '../iterfaces/i-admin-promo-codes-service';
import type { PromoCode, PromoCodePayload } from '../types/promo-codes';

@injectable()
export class AdminPromoCodesService implements IAdminPromoCodesService {
  private readonly apiClient: IApiClient;

  constructor() {
    this.apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
  }

  async getAll(): Promise<PromoCode[]> {
    const response = await this.apiClient.api.get('/api/admin/promo-codes');
    return response.data ?? [];
  }

  async create(payload: PromoCodePayload): Promise<PromoCode> {
    const response = await this.apiClient.api.post('/api/admin/promo-codes', payload);
    return response.data;
  }

  async update(id: string, payload: PromoCodePayload): Promise<PromoCode> {
    const response = await this.apiClient.api.put(`/api/admin/promo-codes/${id}`, payload);
    return response.data;
  }

  async remove(id: string): Promise<void> {
    await this.apiClient.api.delete(`/api/admin/promo-codes/${id}`);
  }
}
