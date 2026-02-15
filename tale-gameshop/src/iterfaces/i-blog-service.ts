import type { BlogListResponse, BlogPost, BlogPostVersion, BlogRecommendationsResponse } from "../types/blog";

export interface IBlogService {
  getPosts(params: { page: number; pageSize: number; tag?: string; search?: string; featured?: boolean; mainFeatured?: boolean }): Promise<BlogListResponse>;
  getPostBySlug(slug: string): Promise<{ post: BlogPost; version: BlogPostVersion }>;
  getHomeRecommendations(params: { anonId?: string; limit?: number }): Promise<BlogRecommendationsResponse>;
  trackEvent(payload: BlogEventPayload): Promise<void>;
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
