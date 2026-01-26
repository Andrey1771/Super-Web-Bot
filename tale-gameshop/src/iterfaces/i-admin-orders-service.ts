import type { Order, OrderFilters, OrderListResponse, OrderStatus } from "../types/orders";

export interface IAdminOrdersService {
  getOrders(params: {
    filters: OrderFilters;
    page: number;
    pageSize: number;
    sort?: string;
  }): Promise<OrderListResponse>;
  getOrderById(id: string): Promise<Order>;
  updateStatus(id: string, status: OrderStatus, note?: string): Promise<Order>;
  exportCsv(orders: Order[]): void;
}
