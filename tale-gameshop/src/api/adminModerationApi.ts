import { apiClient } from "./client";

export type ModerationReview = {
  id: string;
  gameId: string;
  gameTitle: string;
  userName: string;
  userId: string;
  /** Аватар автора из его профиля. null — аватара нет, в очереди будет буква. */
  avatarUrl: string | null;
  rating: number;
  /** Из звёзд: 4–5 — true, 1–2 — false, 3 — null. */
  recommend: boolean | null;
  text: string;
  images: number;
  createdAt: string;
  status: "Published" | "Hidden" | "Pending";
  reportCount: number;
  /** Покупку вернули: отзыв остаётся, на витрине стоит пометка «Refunded». */
  refunded?: boolean;
  /** Автор правил отзыв — когда в последний раз. */
  editedAt?: string | null;
  /** Прошлые версии, свежие первыми. underReport — правили уже под жалобами. */
  revisions?: Array<{ text: string; rating: number; playtimeHours?: number | null; replacedAt: string; underReport: boolean }>;
  lastReportedAt?: string | null;
  /** Жалобы с причинами, свежие первыми: по ним видно, «один обиделся» или «все жалуются на спам». */
  reports?: Array<{ reason: string; comment?: string | null; userName: string; createdAt: string }>;
  helpfulCount: number;
};

export type ReviewFilter = "pending" | "hidden" | "published" | "all";

export const getModerationSummary = async (): Promise<{ pendingReviews: number }> =>
  (await apiClient().get("/api/admin/moderation/summary")).data;

export const listModerationReviews = async (status: ReviewFilter, page = 1, pageSize = 20): Promise<{ total: number; items: ModerationReview[] }> =>
  (await apiClient().get("/api/admin/moderation/reviews", { params: { status, page, pageSize } })).data;

export const publishReview = async (id: string) => (await apiClient().post(`/api/admin/moderation/reviews/${id}/publish`)).data;
export const hideReview = async (id: string) => (await apiClient().post(`/api/admin/moderation/reviews/${id}/hide`)).data;

/**
 * Снять аватар автора отзыва. Отдельно от «скрыть отзыв»: текст бывает нормальным при
 * непристойной картинке и наоборот. Аватар в отзыве не хранится — снимается он у профиля
 * и пропадает сразу везде, где показан.
 */
export const removeReviewAuthorAvatar = async (id: string): Promise<{ removed: boolean }> =>
  (await apiClient().post(`/api/admin/moderation/reviews/${id}/remove-avatar`)).data;

