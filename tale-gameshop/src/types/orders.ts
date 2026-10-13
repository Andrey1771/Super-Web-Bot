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

export type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED" | "PARTIALLY_REFUNDED" | "DISPUTED" | "DISPUTE_LOST" | "FAILED";

/** Спор по оплате (чарджбек) — последний по платежу заказа. */
export type OrderDispute = {
  id: string;
  /** Статус Stripe: needs_response, under_review, won, lost; warning_* — запрос банка без списания денег. */
  status: string;
  reason?: string | null;
  amount: number;
  currency: string;
  /** Крайний срок отправки доказательств в Stripe, ISO. */
  evidenceDueBy?: string | null;
  hasEvidence: boolean;
  openedAt: string;
  closedAt?: string | null;
  /** won | lost | warning_closed; нет — спор идёт. */
  outcome?: string | null;
};

export type FulfillmentStatus = "NOT_STARTED" | "IN_PROGRESS" | "PARTIAL" | "PENDING_KEYS" | "DELIVERED" | "CANCELLED";

export type OrderItem = {
  /** Строка заказа — по ней возвращается позиция. */
  itemId: string;
  /** Стоимость строки целиком (все штуки), в валюте заказа. */
  lineTotal: number;
  /** Сколько штук уже возвращено по позиции. */
  refundedQty: number;
  gameId: string;
  title: string;
  /** Область активации купленного варианта ключа; пусто — вариантов у игры не было. */
  region?: string | null;
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
  /** Возвращено на карту, в валюте заказа (накопительно). */
  refundedAmount?: number;
  /** Оплачено кэшбэком, в валюте заказа; totalAmount — уже без этой части. */
  cashbackApplied?: number;
  /** То же в долларах — столько списано с баланса покупателя. */
  cashbackUsd?: number;
  /** Кэшбэк, начисленный за заказ (только в карточке заказа); нет — не начислялся. */
  cashbackEarned?: {
    amountUsd: number;
    /** В валюте заказа — процент уровня от оплаченного картой. */
    amount: number;
    currency: string;
    percent?: number | null;
    status: "pending" | "available" | "spent" | "expired" | "reverted" | string;
    unlocksAt?: string | null;
    /** Забрано возвратом или спором, в долларах. */
    reversedUsd: number;
  } | null;
  /** Спор по оплате; нет — споров не было. */
  dispute?: OrderDispute | null;
  /** Налог из Stripe Tax; нет — заказ до подключения налога или не через Stripe. */
  tax?: OrderTax | null;
  events: OrderEvent[];
};

export type OrderTax = {
  /** pending — транзакция ещё не записана (ежечасная сверка повторит), recorded — записана. */
  status: 'pending' | 'recorded' | string;
  /** Налог внутри итога, в валюте заказа. */
  amount: number;
  /** Сторнировано возвратами (с налогом), в валюте заказа. */
  reversed: number;
  country?: string | null;
  state?: string | null;
  taxType?: string | null;
  ratePercent?: number | null;
  taxabilityReason?: string | null;
  locationSource?: string | null;
  transactionId?: string | null;
  lastError?: string | null;
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
