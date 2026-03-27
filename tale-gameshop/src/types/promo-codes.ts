export type PromoCodeType = 'percentage' | 'fixed';

export type PromoCode = {
  id: string;
  code: string;
  type: PromoCodeType;
  value: number;
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
  minOrderAmount?: number | null;
  maxDiscountAmount?: number | null;
  firstOrderOnly: boolean;
  startDate: string;
  endDate: string;
  usageLimit?: number | null;
  usagePerUser?: number | null;
};
