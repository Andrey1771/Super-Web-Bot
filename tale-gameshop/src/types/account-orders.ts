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

export type AccountOrderTotals = {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
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
  legacyDetailsUnavailable: boolean;
  items: AccountOrderDetailItem[];
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
