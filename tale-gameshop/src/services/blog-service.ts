import { injectable } from "inversify";
import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";
import type { BlogEventPayload, IBlogService } from "../iterfaces/i-blog-service";
import type { BlogComment, BlogCommentsResponse, BlogEngagementSummary, BlogListResponse, BlogPost, BlogPostStats, BlogPostVersion, BlogRecommendationsResponse } from "../types/blog";
import { getAnonId, getSessionId } from "../hooks/use-blog-tracking";

@injectable()
export class BlogService implements IBlogService {
  private readonly _apiClient: IApiClient;

  constructor() {
    this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
  }

  async getPosts(params: { page: number; pageSize: number; tag?: string; search?: string; featured?: boolean }): Promise<BlogListResponse> {
    const query = new URLSearchParams();
    query.append("status", "PUBLISHED");
    query.append("page", String(params.page));
    query.append("pageSize", String(params.pageSize));
    if (params.tag) {
      query.append("tag", params.tag);
    }
    if (params.search) {
      query.append("search", params.search);
    }
    if (typeof params.featured === "boolean") {
      query.append("featured", String(params.featured));
    }
    const response = await this._apiClient.api.get(`/api/blog/posts?${query.toString()}`);
    return response.data as BlogListResponse;
  }

  async getPostBySlug(slug: string): Promise<{ post: BlogPost; version: BlogPostVersion; stats?: BlogPostStats }> {
    const query = new URLSearchParams();
    const anonId = getAnonId();
    const sessionKey = getSessionId();
    if (anonId) {
      query.append("anonId", anonId);
    }
    if (sessionKey) {
      query.append("sessionKey", sessionKey);
    }
    const suffix = query.toString();
    const response = await this._apiClient.api.get(`/api/blog/posts/${slug}${suffix ? `?${suffix}` : ""}`);
    return response.data as { post: BlogPost; version: BlogPostVersion; stats?: BlogPostStats };
  }

  async getHomeRecommendations(params: { anonId?: string; limit?: number }): Promise<BlogRecommendationsResponse> {
    const query = new URLSearchParams();
    if (params.anonId) {
      query.append("anonId", params.anonId);
    }
    if (params.limit) {
      query.append("limit", String(params.limit));
    }
    // Адрес без слова «recommendations»: его режут фильтры блокировщиков рекламы,
    // и у части посетителей запрос не уходил вовсе.
    const response = await this._apiClient.api.get(`/api/blog/home-feed?${query.toString()}`);
    return response.data as BlogRecommendationsResponse;
  }

  async getComments(params: { postId: string; page: number; pageSize: number }): Promise<BlogCommentsResponse> {
    const query = new URLSearchParams({
      postId: params.postId,
      page: String(params.page),
      pageSize: String(params.pageSize)
    });
    const response = await this._apiClient.api.get(`/api/blog/comments?${query.toString()}`);
    return response.data as BlogCommentsResponse;
  }

  async addComment(params: { postId: string; anonId?: string; text: string }): Promise<BlogComment> {
    const response = await this._apiClient.api.post("/api/blog/comments", {
      postId: params.postId,
      anonId: params.anonId,
      text: params.text
    });
    return response.data as BlogComment;
  }

  async trackEvent(payload: BlogEventPayload): Promise<void> {
    await this._apiClient.api.post("/api/blog/events", {
      postId: payload.postId,
      eventType: payload.eventType,
      ts: payload.ts,
      anonId: payload.anonId,
      sessionId: payload.sessionId,
      dwellMs: payload.dwellMs,
      scrollDepth: payload.scrollDepth,
      referrer: payload.referrer,
      meta: payload.meta
    });
  }

  async getEngagementSummary(postIds: string[], anonId?: string): Promise<BlogEngagementSummary[]> {
    if (!postIds.length) {
      return [];
    }

    const query = new URLSearchParams();
    query.append("postIds", postIds.join(","));
    if (anonId) {
      query.append("anonId", anonId);
    }

    const response = await this._apiClient.api.get(`/api/blog/events/summary?${query.toString()}`);
    return (response.data?.items ?? []) as BlogEngagementSummary[];
  }

  async setReaction(params: { postId: string; reaction: string; anonId?: string; sessionId?: string }): Promise<BlogEngagementSummary> {
    const response = await this._apiClient.api.post("/api/blog/events/reaction", {
      postId: params.postId,
      reaction: params.reaction,
      anonId: params.anonId,
      sessionId: params.sessionId
    });

    return response.data as BlogEngagementSummary;
  }

  async getPostStats(slug: string): Promise<BlogPostStats> {
    const response = await this._apiClient.api.get(`/api/blog/posts/${slug}/stats`);
    return response.data as BlogPostStats;
  }

  async trackPostView(params: { slug: string; anonId?: string; sessionId?: string; isVisible: boolean; hasInteraction: boolean; activeDwellMs: number }): Promise<BlogPostStats> {
    const response = await this._apiClient.api.post(`/api/blog/posts/${params.slug}/register-unique-view`, {
      anonId: params.anonId,
      sessionId: params.sessionId,
      isVisible: params.isVisible,
      hasInteraction: params.hasInteraction,
      activeDwellMs: params.activeDwellMs
    });
    return response.data as BlogPostStats;
  }

  async trackCompletedRead(params: { slug: string; anonId?: string; sessionKey?: string }): Promise<BlogPostStats> {
    const response = await this._apiClient.api.post(`/api/blog/posts/${params.slug}/track-read`, {
      anonId: params.anonId,
      sessionKey: params.sessionKey
    });
    return response.data as BlogPostStats;
  }
}
