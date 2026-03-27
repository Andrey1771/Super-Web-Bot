import type { Order, OrderItem } from "../types/orders";

type ApiOrderItemDto = {
  gameId?: string;
  title?: string;
  price?: number;
  qty?: number;
  keyDeliveryStatus?: "NOT_SENT" | "SENT" | "FAILED";
  keyValue?: string;
};

type ApiOrderDto = {
  id?: string;
  number?: string | number;
  userId?: string;
  userEmail?: string;
  status?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  totalAmount?: number;
  currency?: string;
  items?: ApiOrderItemDto[];
  createdAt?: string;
  updatedAt?: string;
  payment?: {
    provider?: string;
    transactionId?: string;
    method?: string;
  };
  delivery?: {
    type?: "KEY" | "ACCOUNT_TOPUP" | "OTHER";
    details?: string;
  };
  notes?: string;
};

const normalizeStatus = (value?: string): Order["status"] => {
  const normalized = (value ?? "PENDING").toUpperCase();
  if (
    normalized === "PENDING" ||
    normalized === "PAID" ||
    normalized === "PROCESSING" ||
    normalized === "DELIVERED" ||
    normalized === "CANCELLED" ||
    normalized === "REFUNDED" ||
    normalized === "FAILED"
  ) {
    return normalized;
  }
  return "PENDING";
};

const normalizePaymentStatus = (value?: string): Order["paymentStatus"] => {
  if (!value) {
    return undefined;
  }
  const normalized = value.toUpperCase();
  if (normalized === "UNPAID" || normalized === "PAID" || normalized === "REFUNDED" || normalized === "FAILED") {
    return normalized;
  }
  return undefined;
};

const normalizeFulfillmentStatus = (value?: string): Order["fulfillmentStatus"] => {
  if (!value) {
    return undefined;
  }
  const normalized = value.toUpperCase();
  if (normalized === "NOT_STARTED" || normalized === "IN_PROGRESS" || normalized === "DELIVERED" || normalized === "CANCELLED") {
    return normalized;
  }
  return undefined;
};

const mapItem = (item?: ApiOrderItemDto): OrderItem => ({
  gameId: item?.gameId ?? "",
  title: item?.title ?? "Unknown",
  price: item?.price ?? 0,
  qty: item?.qty ?? 1,
  keyDeliveryStatus: item?.keyDeliveryStatus,
  keyValue: item?.keyValue,
});

export const mapOrderDto = (dto: ApiOrderDto): Order => ({
  id: dto.id ?? "",
  number: dto.number ?? dto.id ?? "",
  userId: dto.userId ?? "",
  userEmail: dto.userEmail,
  status: normalizeStatus(dto.status),
  paymentStatus: normalizePaymentStatus(dto.paymentStatus),
  fulfillmentStatus: normalizeFulfillmentStatus(dto.fulfillmentStatus),
  totalAmount: dto.totalAmount ?? 0,
  currency: dto.currency ?? "USD",
  items: (dto.items ?? []).map(mapItem),
  createdAt: dto.createdAt ?? "",
  updatedAt: dto.updatedAt ?? dto.createdAt ?? "",
  payment: dto.payment,
  delivery: dto.delivery,
  notes: dto.notes,
});

export const mapOrderListResponse = (response: { items?: ApiOrderDto[]; total?: number }) => ({
  items: (response.items ?? []).map(mapOrderDto),
  total: response.total ?? 0,
});
