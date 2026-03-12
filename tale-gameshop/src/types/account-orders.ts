export type AccountOrderStatus = 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'REFUNDED' | 'FAILED' | 'CANCELLED';

export type AccountOrderListItem = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: AccountOrderStatus | string;
  totalAmount: number;
  currency: string;
  itemsCount: number;
  paymentMethod?: string | null;
  refundedAmount: number;
  firstItemTitle?: string | null;
  itemTitles: string[];
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
