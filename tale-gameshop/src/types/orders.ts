export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "PROCESSING"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED"
  | "FAILED";

export type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED" | "FAILED";

export type FulfillmentStatus = "NOT_STARTED" | "IN_PROGRESS" | "DELIVERED" | "CANCELLED";

export type OrderItem = {
  gameId: string;
  title: string;
  price: number;
  qty: number;
  keyDeliveryStatus?: "NOT_SENT" | "SENT" | "FAILED";
  keyValue?: string;
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
