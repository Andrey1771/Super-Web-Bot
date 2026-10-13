export type AccountOrderStatus = 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'REFUNDED' | 'FAILED' | 'CANCELLED';

export type AccountOrderPreview = {
  firstTitle: string;
  firstCoverUrl?: string | null;
  extraCount: number;
};

export type AccountOrderListItem = {
  orderId: string;
  internalId: string;
  createdAt: string;
  status: AccountOrderStatus | string;
  totalAmount: number;
  currency: string;
  itemsCount: number;
  paymentMethod?: string | null;
  refundedAmount: number;
  preview: AccountOrderPreview;
  legacyDetailsUnavailable: boolean;
};

export type AccountOrderCashback = {
  /** Оплачено кэшбэком, в валюте заказа. */
  applied: number;
  /** Начислено за заказ, в валюте заказа; null — не начислялось. */
  earned?: number | null;
  percent?: number | null;
  earnedStatus?: 'pending' | 'available' | 'spent' | 'expired' | 'reverted' | null;
  unlocksAt?: string | null;
};

export type AccountOrderTotals = {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  /** Налог уже внутри subtotal и total (цены с налогом) — к итогу не прибавлять. */
  taxIncluded?: boolean;
  /** vat, gst, sales_tax… и ставка — для подписи «Incl. VAT 19%». */
  taxType?: string | null;
  taxRatePercent?: number | null;
  total: number;
};

export type AccountOrderDetailItem = {
  itemId: string;
  productType: string;
  gameId?: string | null;
  title: string;
  coverUrl?: string | null;
  platform?: string | null;
  region?: string | null;
  quantity: number;
  unitPrice: number;
  currency: string;
  unitDiscount: number;
  finalUnitPrice: number;
  lineTotal: number;
  deliveryType?: string | null;
  keys: string[];
  /** Адрес страницы игры по каталогу сейчас. Пусто, если игры больше нет. */
  slug?: string | null;
  /** Товар всё ещё в каталоге. Нет — строка без ссылки и с пометкой «больше не продаётся». */
  available?: boolean;
  /** Сервер разрешает позвать оценить: заказ оплачен, ключ выдан, есть куда вести. */
  canReview?: boolean;
  /** Отзыв уже написан — ведём править, а не писать заново. */
  hasReview?: boolean;
};

export type AccountOrderDetails = {
  orderId: string;
  internalId: string;
  createdAt: string;
  paidAt?: string | null;
  status: AccountOrderStatus | string;
  currency: string;
  totals: AccountOrderTotals;
  paymentMethod?: string | null;
  /** Кэшбэк по заказу; null — не оплачивался им и не начислялся. */
  cashback?: AccountOrderCashback | null;
  legacyDetailsUnavailable: boolean;
  items: AccountOrderDetailItem[];
};

/** Полные ключи заказа по позициям — по явному «Show keys». */
export type AccountOrderKeysResponse = {
  items: Array<{ itemId: string; keys: string[] }>;
};

/** Письмо с ключами переслано: куда (адрес замаскирован) и сколько ключей. */
export type ResendOrderKeysResponse = {
  sentTo: string;
  count: number;
};

export type FetchAccountOrdersParams = {
  page: number;
  pageSize: number;
  status: 'all' | 'completed' | 'refunded' | 'pending' | 'failed';
  q?: string;
  sort: 'newest' | 'oldest' | 'total_desc' | 'total_asc';
};

export type AccountOrdersResponse = {
  items: AccountOrderListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};
