import type { Order, OrderEvent, OrderItem } from "../types/orders";

type ApiOrderItemDto = {
  gameId?: string;
  title?: string;
  price?: number;
  qty?: number;
  keysDelivered?: number;
  keysNeeded?: number;
  keyMasks?: string[];
  keyDeliveryStatus?: string;
};

type ApiOrderEventDto = {
  type?: string;
  message?: string;
  actor?: string;
  createdAt?: string;
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
  paidAt?: string;
  payment?: {
    provider?: string;
    transactionId?: string;
    method?: string;
  };
  requiresDeliveryVerification?: boolean;
  notes?: string;
  promoCode?: string;
  events?: ApiOrderEventDto[];
};

const ORDER_STATUSES: Order["status"][] = [
  "PENDING", "AWAITING_PAYMENT", "PAID", "PROCESSING", "AWAITING_KEYS",
  "DELIVERED", "CANCELLED", "REFUNDED", "REFUND_PENDING", "FAILED",
];

// Незнакомый статус раньше молча превращался в PENDING — и AWAITING_KEYS (клиент заплатил,
// ключа нет) выглядел в списке как «ещё не оплачен». Теперь неизвестное остаётся видимым.
const normalizeStatus = (value?: string): Order["status"] => {
  const normalized = (value ?? "PENDING").toUpperCase() as Order["status"];
  return ORDER_STATUSES.includes(normalized) ? normalized : (normalized as Order["status"]);
};

const normalizePaymentStatus = (value?: string): Order["paymentStatus"] =>
  value ? (value.toUpperCase() as Order["paymentStatus"]) : undefined;

const normalizeFulfillmentStatus = (value?: string): Order["fulfillmentStatus"] =>
  value ? (value.toUpperCase() as Order["fulfillmentStatus"]) : undefined;

const mapItem = (item?: ApiOrderItemDto): OrderItem => ({
  gameId: item?.gameId ?? "",
  title: item?.title ?? "Unknown",
  price: item?.price ?? 0,
  qty: item?.qty ?? 1,
  keysDelivered: item?.keysDelivered ?? 0,
  keysNeeded: item?.keysNeeded ?? item?.qty ?? 1,
  keyMasks: item?.keyMasks ?? [],
  keyDeliveryStatus: (item?.keyDeliveryStatus as OrderItem["keyDeliveryStatus"]) ?? undefined,
});

const mapEvent = (event: ApiOrderEventDto): OrderEvent => ({
  type: event.type ?? "",
  message: event.message,
  actor: event.actor,
  createdAt: event.createdAt ?? "",
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
  paidAt: dto.paidAt,
  payment: dto.payment,
  requiresDeliveryVerification: dto.requiresDeliveryVerification,
  notes: dto.notes,
  promoCode: dto.promoCode,
  events: (dto.events ?? []).map(mapEvent),
});

export const mapOrderListResponse = (response: { items?: ApiOrderDto[]; total?: number }) => ({
  items: (response.items ?? []).map(mapOrderDto),
  total: response.total ?? 0,
});
