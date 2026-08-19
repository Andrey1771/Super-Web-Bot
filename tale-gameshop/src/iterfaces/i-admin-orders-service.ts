import type { Order, OrderAction, OrderActionResult, OrderFilters, OrderListResponse, OrderStatus } from "../types/orders";

export interface IAdminOrdersService {
  getOrders(params: {
    filters: OrderFilters;
    page: number;
    pageSize: number;
    sort?: string;
  }): Promise<OrderListResponse>;
  getOrderById(id: string): Promise<Order>;
  /** Действие специалиста над заказом; 409 приходит как ok=false с сообщением, не как исключение. */
  runAction(id: string, action: OrderAction, reason?: string): Promise<OrderActionResult>;
  /** Аварийная смена статуса — с обязательной причиной. */
  forceStatus(id: string, status: OrderStatus, reason: string): Promise<OrderActionResult>;
  /** CSV по текущему фильтру, все страницы — собирает сервер. */
  exportCsv(filters: OrderFilters, sort?: string): Promise<void>;
}
