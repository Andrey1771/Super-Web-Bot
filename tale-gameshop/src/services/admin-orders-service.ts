import { injectable } from "inversify";
import IDENTIFIERS from "../constants/identifiers";
import container from "../inversify.config";
import type { IApiClient } from "../iterfaces/i-api-client";
import type { IAdminOrdersService } from "../iterfaces/i-admin-orders-service";
import type { Order, OrderAction, OrderActionResult, OrderFilters, OrderListResponse, OrderStatus } from "../types/orders";
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

  async runAction(id: string, action: OrderAction, reason?: string): Promise<OrderActionResult> {
    // 409 — предусловие не выполнено («заказ не оплачен», «уже возвращён»): это ответ, а не
    // ошибка транспорта, поэтому не бросаем, а отдаём вызывающему вместе с сообщением.
    const response = await this._apiClient.api.post(
      `/api/admin/orders/${id}/${action}`,
      { reason },
      { validateStatus: (status) => status < 500 || status === 502 }
    );
    const data = response.data ?? {};
    return {
      ok: Boolean(data.ok),
      message: String(data.message ?? (response.status >= 400 ? `Request failed (${response.status}).` : "")),
      order: mapOrderDto(data.order ?? {}),
    };
  }

  async forceStatus(id: string, status: OrderStatus, reason: string): Promise<OrderActionResult> {
    const response = await this._apiClient.api.post(
      `/api/admin/orders/${id}/force-status`,
      { status, reason },
      { validateStatus: (code) => code < 500 }
    );
    const data = response.data ?? {};
    return {
      ok: Boolean(data.ok),
      message: String(data.message ?? ""),
      order: mapOrderDto(data.order ?? {}),
    };
  }

  /**
   * Выгрузка идёт на сервере по текущему фильтру — все страницы. Раньше CSV собирался в
   * браузере из загруженной страницы, и «выгрузить месяц» означало двадцать файлов.
   */
  async exportCsv(filters: OrderFilters, sort?: string): Promise<void> {
    const query = new URLSearchParams();
    if (filters.search) query.append("search", filters.search);
    if (filters.status) query.append("status", filters.status);
    if (filters.paymentStatus) query.append("paymentStatus", filters.paymentStatus);
    if (filters.dateFrom) query.append("dateFrom", filters.dateFrom);
    if (filters.dateTo) query.append("dateTo", filters.dateTo);
    if (sort) query.append("sort", sort);

    const response = await this._apiClient.api.get(`/api/admin/orders/export?${query.toString()}`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(response.data as Blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `orders-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
