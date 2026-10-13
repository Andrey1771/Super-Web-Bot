import type { PromoCode, PromoCodePayload } from '../types/promo-codes';

export interface IAdminPromoCodesService {
  getAll(): Promise<PromoCode[]>;
  create(payload: PromoCodePayload): Promise<PromoCode>;
  update(id: string, payload: PromoCodePayload): Promise<PromoCode>;
  remove(id: string): Promise<void>;
}
