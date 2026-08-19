export type OrderStatus =
  | "PENDING"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "PROCESSING"
  | "AWAITING_KEYS"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED"
  | "REFUND_PENDING"
  | "FAILED";

export type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED" | "PARTIALLY_REFUNDED" | "DISPUTED" | "FAILED";

export type FulfillmentStatus = "NOT_STARTED" | "IN_PROGRESS" | "PARTIAL" | "PENDING_KEYS" | "DELIVERED" | "CANCELLED";

export type OrderItem = {
  gameId: string;
  title: string;
  price: number;
  qty: number;
  keysDelivered: number;
  keysNeeded: number;
  /** Маски выданных ключей (последние четыре символа) — открытых значений в админке нет. */
  keyMasks: string[];
  keyDeliveryStatus?: "NOT_SENT" | "PARTIAL" | "SENT";
};

/**
 * Запись журнала заказа. actor — почта специалиста для ручных действий, пусто — система
 * (вебхук, воркер, автоматическая выдача).
 */
export type OrderEvent = {
  type: string;
  message?: string;
  actor?: string;
  createdAt: string;
};

export type Order = {
  id: string;
  number: string | number;
  userId: string;
  userEmail?: string;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  fulfillmentStatus?: FulfillmentStatus;
  totalAmount: number;
  currency: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  payment?: {
    provider?: string;
    transactionId?: string;
    method?: string;
  };
  /** Гость не подтвердил почту — выдача заблокирована. */
  requiresDeliveryVerification?: boolean;
  notes?: string;
  promoCode?: string;
  events: OrderEvent[];
};

export type OrderListResponse = {
  items: Order[];
  total: number;
};

export type OrderFilters = {
  search: string;
  status: OrderStatus | "";
  paymentStatus: PaymentStatus | "";
  dateFrom: string;
  dateTo: string;
};

/** Ответ действия над заказом: сообщение для тоста и заказ после действия. */
export type OrderActionResult = {
  ok: boolean;
  message: string;
  order: Order;
};

export type OrderAction = "resend-keys" | "deliver-keys" | "refund" | "mark-refunded" | "cancel";
