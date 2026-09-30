import { apiClient } from "./client";

export type CustomerSearchHit = {
  email: string;
  name?: string;
  keycloakId?: string;
  enabled?: boolean | null;
  /** account — есть учётка; guest — только заказы. */
  source: "account" | "guest";
  orderCount: number;
  /** Дата последнего заказа. У найденных поиском может отсутствовать. */
  lastOrderAt?: string | null;
};

/** Окно списка покупателей: строки и точка, с которой продолжать прокрутку. */
export type CustomerBrowsePage = {
  items: CustomerSearchHit[];
  /** Почта последней строки. null — список кончился. */
  nextCursor: string | null;
  /** Всего строк в срезе. Приходит только с первым окном — дальше null. */
  total: number | null;
};

export type CustomerOrder = {
  id: string;
  number: string;
  createdAt: string;
  status: string;
  total: number;
  currency: string;
  items: string[];
};

export type CustomerCard = {
  email: string;
  name?: string;
  keycloakId?: string;
  enabled?: boolean | null;
  emailVerified?: boolean | null;
  /** Keycloak не ответил: статус учётки неизвестен, остальное собрано по локальным данным. */
  profileUnavailable: boolean;
  registeredAt?: string;
  lastLoginAt?: string;
  orderCount: number;
  paidOrderCount: number;
  refundedOrderCount: number;
  spentByCurrency: Record<string, number>;
  firstOrderAt?: string;
  lastOrderAt?: string;
  recentOrders: CustomerOrder[];
  keyCount: number;
  recentKeys: Array<{ gameId: string; keyType?: string; issuedAt: string; masked: string }>;
  ticketCount: number;
  recentTickets: Array<{ id: string; publicId: string; subject: string; status: string; lastMessageAt: string }>;
  chatCount: number;
  recentChats: Array<{ id: string; status: string; lastMessageAt: string; summary?: string }>;
  promoCodesUsed: string[];
};

export type CustomerActionResult = { ok: boolean; message: string };

export const searchCustomers = async (query: string): Promise<CustomerSearchHit[]> => {
  const response = await apiClient().get("/api/admin/customers", { params: { q: query } });
  return Array.isArray(response.data) ? response.data : [];
};

/**
 * Окно списка покупателей. Продолжение задаётся почтой последней строки, а не номером
 * страницы: сервер по ней сразу попадает в нужное место индекса, и стоимость окна не
 * растёт по мере прокрутки.
 */
/** Срез таблицы клиентов: все покупатели, недавние, с возвратами, заблокированные, без заказов. */
export type CustomerBrowseFilter = "all" | "recent" | "refunded" | "blocked" | "no_orders";

export const browseCustomers = async (
  after: string | null,
  limit = 50,
  filter: CustomerBrowseFilter = "all",
): Promise<CustomerBrowsePage> => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("filter", filter);
  if (after) {
    params.set("after", after);
  }
  const response = await apiClient().get(`/api/admin/customers/browse?${params.toString()}`);
  return response.data as CustomerBrowsePage;
};

/** Текущий срез таблицы файлом — сервер собирает его целиком, а не по окнам. */
export const exportCustomersCsv = async (filter: CustomerBrowseFilter, query: string): Promise<Blob> => {
  const params = new URLSearchParams();
  params.set("filter", filter);
  if (query.trim()) {
    params.set("q", query.trim());
  }
  const response = await apiClient().get(`/api/admin/customers/export?${params.toString()}`, { responseType: "blob" });
  return response.data as Blob;
};

export const getCustomer = async (email: string): Promise<CustomerCard> => {
  const response = await apiClient().get(`/api/admin/customers/${encodeURIComponent(email)}`);
  return response.data;
};

// 409 («уже заблокирован», «гость без учётки») — ответ, а не ошибка транспорта.
const runAction = async (email: string, action: "block" | "unblock" | "reset-password"): Promise<CustomerActionResult> => {
  const response = await apiClient().post(
    `/api/admin/customers/${encodeURIComponent(email)}/${action}`,
    null,
    { validateStatus: (status) => status < 500 }
  );
  const data = response.data ?? {};
  return { ok: Boolean(data.ok), message: String(data.message ?? (response.status >= 400 ? `Request failed (${response.status}).` : "")) };
};

export const blockCustomer = (email: string) => runAction(email, "block");
export const unblockCustomer = (email: string) => runAction(email, "unblock");
export const sendCustomerPasswordReset = (email: string) => runAction(email, "reset-password");
