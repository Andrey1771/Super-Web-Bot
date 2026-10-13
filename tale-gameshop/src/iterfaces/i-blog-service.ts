import type { BlogComment, BlogCommentsResponse, BlogEngagementSummary, BlogListResponse, BlogPost, BlogPostStats, BlogPostVersion, BlogRecommendationsResponse } from "../types/blog";

export interface IBlogService {
  getComments(params: { postId: string; page: number; pageSize: number }): Promise<BlogCommentsResponse>;
  /** Требует авторизации: подпись комментария сервер берёт из ника профиля. */
  addComment(params: { postId: string; anonId?: string; text: string }): Promise<BlogComment>;
  getPosts(params: { page: number; pageSize: number; tag?: string; search?: string; featured?: boolean }): Promise<BlogListResponse>;
  getPostBySlug(slug: string): Promise<{ post: BlogPost; version: BlogPostVersion; stats?: BlogPostStats }>;
  getHomeRecommendations(params: { anonId?: string; limit?: number }): Promise<BlogRecommendationsResponse>;
  trackEvent(payload: BlogEventPayload): Promise<void>;
  getEngagementSummary(postIds: string[], anonId?: string): Promise<BlogEngagementSummary[]>;
  setReaction(params: { postId: string; reaction: string; anonId?: string; sessionId?: string }): Promise<BlogEngagementSummary>;
  getPostStats(slug: string): Promise<BlogPostStats>;
  trackPostView(params: { slug: string; anonId?: string; sessionId?: string; isVisible: boolean; hasInteraction: boolean; activeDwellMs: number }): Promise<BlogPostStats>;
  trackCompletedRead(params: { slug: string; anonId?: string; sessionKey?: string }): Promise<BlogPostStats>;
}

export type BlogEventPayload = {
  postId: string;
  eventType: string;
  ts?: string;
  anonId?: string;
  sessionId?: string;
  dwellMs?: number;
  scrollDepth?: number;
  referrer?: string;
  meta?: Record<string, string>;
};
