import { injectable } from "inversify";
import IDENTIFIERS from "../constants/identifiers";
import container from "../inversify.config";
import type { IApiClient } from "../iterfaces/i-api-client";
import type { IAdminOrdersService } from "../iterfaces/i-admin-orders-service";
import type { Order, OrderFilters, OrderListResponse, OrderStatus } from "../types/orders";
import { mapOrderDto, mapOrderListResponse } from "../utils/mapOrderDto";

@injectable()
export class AdminOrdersService implements IAdminOrdersService {
  private readonly _apiClient: IApiClient;

  constructor() {
    this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
  }

  async getOrders(params: {
    filters: OrderFilters;
    page: number;
    pageSize: number;
    sort?: string;
  }): Promise<OrderListResponse> {
    const { filters, page, pageSize, sort } = params;
    const query = new URLSearchParams();
    if (filters.search) {
      query.append("search", filters.search);
    }
    if (filters.status) {
      query.append("status", filters.status);
    }
    if (filters.paymentStatus) {
      query.append("paymentStatus", filters.paymentStatus);
    }
    if (filters.dateFrom) {
      query.append("dateFrom", filters.dateFrom);
    }
    if (filters.dateTo) {
      query.append("dateTo", filters.dateTo);
    }
    query.append("page", String(page));
    query.append("pageSize", String(pageSize));
    if (sort) {
      query.append("sort", sort);
    }
    const response = await this._apiClient.api.get(`/api/admin/orders?${query.toString()}`);
    return mapOrderListResponse(response.data ?? {});
  }

  async getOrderById(id: string): Promise<Order> {
    const response = await this._apiClient.api.get(`/api/admin/orders/${id}`);
    return mapOrderDto(response.data ?? {});
  }

  async updateStatus(id: string, status: OrderStatus, note?: string): Promise<Order> {
    const response = await this._apiClient.api.patch(`/api/admin/orders/${id}/status`, {
      status,
      note,
    });
    return mapOrderDto(response.data ?? {});
  }

  exportCsv(orders: Order[]): void {
    const headers = ["Order #", "Created at", "Customer", "Items", "Total", "Currency", "Status", "Payment"];
    const rows = orders.map((order) => [
      String(order.number ?? order.id),
      order.createdAt,
      order.userEmail ?? order.userId,
      String(order.items.length),
      String(order.totalAmount),
      order.currency,
      order.status,
      order.paymentStatus ?? "",
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/\"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `orders-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
