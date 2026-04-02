import type { BlogEngagementSummary, BlogListResponse, BlogPost, BlogPostStats, BlogPostVersion, BlogRecommendationsResponse } from "../types/blog";

export interface IBlogService {
  getPosts(params: { page: number; pageSize: number; tag?: string; search?: string; featured?: boolean }): Promise<BlogListResponse>;
  getPostBySlug(slug: string): Promise<{ post: BlogPost; version: BlogPostVersion; stats?: BlogPostStats }>;
  getHomeRecommendations(params: { anonId?: string; limit?: number }): Promise<BlogRecommendationsResponse>;
  trackEvent(payload: BlogEventPayload): Promise<void>;
  getEngagementSummary(postIds: string[], anonId?: string): Promise<BlogEngagementSummary[]>;
  setReaction(params: { postId: string; reaction: string; anonId?: string; sessionId?: string }): Promise<BlogEngagementSummary>;
  getPostStats(slug: string): Promise<BlogPostStats>;
  trackPostView(params: { slug: string; anonId?: string; sessionKey?: string }): Promise<BlogPostStats>;
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
