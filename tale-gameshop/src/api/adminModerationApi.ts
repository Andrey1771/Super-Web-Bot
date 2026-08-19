import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export type ModerationReview = {
  id: string;
  gameId: string;
  gameTitle: string;
  userName: string;
  userId: string;
  rating: number;
  recommend: boolean;
  text: string;
  images: number;
  createdAt: string;
  status: "Published" | "Hidden" | "Pending";
  reportCount: number;
  lastReportedAt?: string | null;
  helpfulCount: number;
  shopReply?: { text: string; author: string; createdAt: string } | null;
};

export type ModerationQuestion = {
  id: string;
  gameId: string;
  gameTitle: string;
  userName: string;
  question: string;
  createdAt: string;
  answers: Array<{ id: string; userName: string; text: string; createdAt: string; isOfficial: boolean }>;
};

export type ReviewFilter = "pending" | "hidden" | "published" | "all";
export type QuestionFilter = "unanswered" | "all";

export const getModerationSummary = async (): Promise<{ pendingReviews: number; unansweredQuestions: number }> =>
  (await apiClient().get("/api/admin/moderation/summary")).data;

export const listModerationReviews = async (status: ReviewFilter, page = 1, pageSize = 20): Promise<{ total: number; items: ModerationReview[] }> =>
  (await apiClient().get("/api/admin/moderation/reviews", { params: { status, page, pageSize } })).data;

export const publishReview = async (id: string) => (await apiClient().post(`/api/admin/moderation/reviews/${id}/publish`)).data;
export const hideReview = async (id: string) => (await apiClient().post(`/api/admin/moderation/reviews/${id}/hide`)).data;
export const replyToReview = async (id: string, text: string) => (await apiClient().post(`/api/admin/moderation/reviews/${id}/reply`, { text })).data;

export const listModerationQuestions = async (filter: QuestionFilter, page = 1, pageSize = 20): Promise<{ total: number; items: ModerationQuestion[] }> =>
  (await apiClient().get("/api/admin/moderation/questions", { params: { filter, page, pageSize } })).data;

export const answerQuestion = async (id: string, text: string) => (await apiClient().post(`/api/admin/moderation/questions/${id}/answer`, { text })).data;
