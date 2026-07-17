import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export type SubscriberStatus = "pending" | "confirmed" | "unsubscribed";

/**
 * Подписка на рассылку (double opt-in для гостей).
 * Возвращает "pending" (проверьте почту) или "confirmed" (владелец аккаунта подписал свой email).
 */
export const subscribeNewsletter = async (email: string, source: string): Promise<SubscriberStatus> => {
  const response = await apiClient().post("/api/newsletter/subscribe", {
    email,
    source,
    locale: document.documentElement.lang || "en",
  });
  return (response.data?.status as SubscriberStatus) ?? "pending";
};

export const confirmNewsletter = async (token: string): Promise<void> => {
  await apiClient().post("/api/newsletter/confirm", { token });
};

export const unsubscribeNewsletter = async (token: string): Promise<void> => {
  await apiClient().post("/api/newsletter/unsubscribe", { token });
};

// ---- Личный кабинет (требует авторизации) ----

export interface MyNewsletter {
  subscribed: boolean;
  status: SubscriberStatus | null;
}

export const getMyNewsletter = async (): Promise<MyNewsletter> => {
  const response = await apiClient().get("/api/newsletter/me");
  return response.data as MyNewsletter;
};

export const setMyNewsletter = async (subscribed: boolean): Promise<MyNewsletter> => {
  const response = await apiClient().put("/api/newsletter/me", { subscribed });
  return response.data as MyNewsletter;
};

// ---- Админка ----

export interface AdminSubscriber {
  id: string;
  email: string;
  status: SubscriberStatus;
  sources: string[];
  locale?: string | null;
  hasAccount: boolean;
  createdAt: string;
  confirmedAt?: string | null;
  unsubscribedAt?: string | null;
}

export interface AdminSubscribersPage {
  total: number;
  page: number;
  pageSize: number;
  items: AdminSubscriber[];
}

export interface AdminNewsletterStats {
  confirmed: number;
  pending: number;
  unsubscribed: number;
  newLast30Days: number;
  bySource: Record<string, number>;
}

export interface AdminCampaign {
  id: string;
  type: "manual" | "digest";
  /** Язык кампании (дайджест шлётся по языкам подписчиков); null — всем. */
  locale?: string | null;
  subject: string;
  status: "queued" | "sending" | "sent" | "failed";
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdBy?: string | null;
  scheduledAt?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export const adminGetSubscribers = async (params: {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminSubscribersPage> => {
  const response = await apiClient().get("/api/admin/newsletter/subscribers", { params });
  return response.data as AdminSubscribersPage;
};

export const adminGetNewsletterStats = async (): Promise<AdminNewsletterStats> => {
  const response = await apiClient().get("/api/admin/newsletter/stats");
  return response.data as AdminNewsletterStats;
};

export const adminGetCampaigns = async (): Promise<AdminCampaign[]> => {
  const response = await apiClient().get("/api/admin/newsletter/campaigns");
  return response.data as AdminCampaign[];
};

export const adminCreateCampaign = async (
  subject: string,
  body: string,
  scheduledAt?: string,
): Promise<void> => {
  await apiClient().post("/api/admin/newsletter/campaigns", { subject, body, scheduledAt });
};

/** Предпросмотр письма: сервер рендерит тем же кодом, что и реальную отправку. */
export const adminPreviewCampaign = async (body: string): Promise<string> => {
  const response = await apiClient().post("/api/admin/newsletter/campaigns/preview", { body });
  return (response.data?.html as string) ?? "";
};

export const adminSendTest = async (to: string, subject: string, body: string): Promise<void> => {
  await apiClient().post("/api/admin/newsletter/campaigns/test", { to, subject, body });
};

/** CSV подписчиков — скачивание через axios (заголовок авторизации нужен, простой href не подходит). */
export const adminDownloadSubscribersCsv = async (): Promise<void> => {
  const response = await apiClient().get("/api/admin/newsletter/export", { responseType: "blob" });
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
