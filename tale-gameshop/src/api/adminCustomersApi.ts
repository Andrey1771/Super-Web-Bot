import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export type CustomerSearchHit = {
  email: string;
  name?: string;
  keycloakId?: string;
  enabled?: boolean | null;
  /** account — есть учётка; guest — только заказы. */
  source: "account" | "guest";
  orderCount: number;
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
