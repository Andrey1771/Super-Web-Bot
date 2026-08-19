export type PromoCodeType = 'percentage' | 'fixed';

export type PromoCode = {
  id: string;
  code: string;
  type: PromoCodeType;
  value: number;
  /**
   * Валюта абсолютных сумм — fixed-скидки, minOrder, maxDiscount. Промокод с валютой не
   * сработает в корзине другой валюты; у чисто процентного без порогов валюты нет.
   */
  currency?: string | null;
  minOrderAmount?: number | null;
  maxDiscountAmount?: number | null;
  firstOrderOnly: boolean;
  startDate: string;
  endDate: string;
  usageLimit?: number | null;
  usagePerUser?: number | null;
  isActive: boolean;
  createdAt: string;
  usedCount: number;
  remaining?: number | null;
};

export type PromoCodePayload = {
  code: string;
  type: PromoCodeType;
  value: number;
  currency?: string | null;
  minOrderAmount?: number | null;
  maxDiscountAmount?: number | null;
  firstOrderOnly: boolean;
  startDate: string;
  endDate: string;
  usageLimit?: number | null;
  usagePerUser?: number | null;
};
