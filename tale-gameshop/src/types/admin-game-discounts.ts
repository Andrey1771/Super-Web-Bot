export type GameDiscountStatus = "no_discount" | "scheduled" | "active" | "expired";

export type AdminGameDiscountRow = {
  gameId: string;
  title: string;
  imagePath?: string | null;
  basePrice: number;
  discountType: "percentage" | null;
  discountValue: number | null;
  finalPrice: number;
  discountPercent: number | null;
  startDate: string | null;
  endDate: string | null;
  status: GameDiscountStatus;
};

export type UpsertGameDiscountPayload = {
  discountPercent: number;
  startDate: string;
  endDate: string;
};

export type BulkUpsertGameDiscountPayload = {
  gameIds: string[];
  discountPercent: number;
  startDate: string;
  endDate: string;
};
