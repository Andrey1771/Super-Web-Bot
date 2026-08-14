import { injectable } from "inversify";
import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";
import type { IAdminBlogService, AdminBlogPayload, AdminBlogPostAnalytics, AdminBlogOverviewAnalytics, AdminBlogBreakdown, AdminBlogComment, AdminBlogCommentStatus } from "../iterfaces/i-admin-blog-service";
import type { BlogPost, BlogPostVersion, BlogStatus } from "../types/blog";

@injectable()
export class AdminBlogService implements IAdminBlogService {
  private readonly _apiClient: IApiClient;

  constructor() {
    this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
  }

  async getComments(params: {
    page: number;
    pageSize: number;
    status?: AdminBlogCommentStatus | "";
  }): Promise<{ items: AdminBlogComment[]; total: number }> {
    const query = new URLSearchParams();
    query.append("page", String(params.page));
    query.append("pageSize", String(params.pageSize));
    if (params.status) {
      query.append("status", params.status);
    }
    const response = await this._apiClient.api.get(`/api/admin/blog/comments?${query.toString()}`);
    return response.data as { items: AdminBlogComment[]; total: number };
  }

  async setCommentStatus(id: string, status: AdminBlogCommentStatus): Promise<void> {
    await this._apiClient.api.post(`/api/admin/blog/comments/${id}/status`, { status });
  }

  async deleteComment(id: string): Promise<void> {
    await this._apiClient.api.delete(`/api/admin/blog/comments/${id}`);
  }

  async banCommentAuthor(commentId: string): Promise<void> {
    await this._apiClient.api.post(`/api/admin/blog/comments/${commentId}/ban-author`, {});
  }

  async unbanCommentAuthor(commentId: string): Promise<void> {
    await this._apiClient.api.post(`/api/admin/blog/comments/${commentId}/unban-author`, {});
  }

  async getPosts(params: {
    page: number;
    pageSize: number;
    status?: BlogStatus | "";
    search?: string;
    tag?: string;
  }): Promise<{ items: BlogPost[]; total: number }> {
    const query = new URLSearchParams();
    query.append("page", String(params.page));
    query.append("pageSize", String(params.pageSize));
    if (params.status) {
      query.append("status", params.status);
    }
    if (params.search) {
      query.append("search", params.search);
    }
    if (params.tag) {
      query.append("tag", params.tag);
    }
    const response = await this._apiClient.api.get(`/api/admin/blog/posts?${query.toString()}`);
    return response.data as { items: BlogPost[]; total: number };
  }

  async getPost(id: string): Promise<{ post: BlogPost; version: BlogPostVersion }> {
    const response = await this._apiClient.api.get(`/api/admin/blog/posts/${id}`);
    return response.data as { post: BlogPost; version: BlogPostVersion };
  }

  async createPost(payload: AdminBlogPayload): Promise<BlogPost> {
    const response = await this._apiClient.api.post(`/api/admin/blog/posts`, payload);
    return response.data as BlogPost;
  }

  async updatePost(id: string, payload: AdminBlogPayload): Promise<BlogPost> {
    const response = await this._apiClient.api.put(`/api/admin/blog/posts/${id}`, payload);
    return response.data as BlogPost;
  }

  async getVersions(id: string): Promise<Array<Pick<BlogPostVersion, "id" | "versionNumber" | "createdAt" | "createdBy" | "changeNote">>> {
    const response = await this._apiClient.api.get(`/api/admin/blog/posts/${id}/versions`);
    return response.data as Array<Pick<BlogPostVersion, "id" | "versionNumber" | "createdAt" | "createdBy" | "changeNote">>;
  }

  async getVersion(id: string, versionId: string): Promise<BlogPostVersion> {
    const response = await this._apiClient.api.get(`/api/admin/blog/posts/${id}/versions/${versionId}`);
    return response.data as BlogPostVersion;
  }

  async restoreVersion(id: string, versionId: string, changeNote?: string): Promise<BlogPost> {
    const response = await this._apiClient.api.post(`/api/admin/blog/posts/${id}/restore`, {
      versionId,
      changeNote,
    });
    return response.data as BlogPost;
  }

  async archivePost(id: string): Promise<BlogPost> {
    const response = await this._apiClient.api.delete(`/api/admin/blog/posts/${id}`);
    return response.data as BlogPost;
  }

  async getHomeSettings(): Promise<{ mainHeroPostId?: string; updatedAt?: string; updatedBy?: string }> {
    const response = await this._apiClient.api.get(`/api/admin/blog/home-settings`);
    return response.data as { mainHeroPostId?: string; updatedAt?: string; updatedBy?: string };
  }

  async setMainHeroPost(postId?: string): Promise<{ mainHeroPostId?: string; updatedAt?: string; updatedBy?: string }> {
    const response = await this._apiClient.api.put(`/api/admin/blog/home-settings/main-hero`, {
      mainHeroPostId: postId ?? null,
    });
    return response.data as { mainHeroPostId?: string; updatedAt?: string; updatedBy?: string };
  }

  async getViewSettings(): Promise<{
    countGuestViewsInPublicCounts: boolean;
    publicUniqueViews: number;
    authenticatedUniqueViews: number;
    guestUniqueViewsTotal: number;
    guestUniqueViewsCounted: number;
    guestUniqueViewsExcluded: number;
    guestUniqueViewsNotCountedBySetting: number;
  }> {
    const response = await this._apiClient.api.get(`/api/admin/blog/view-settings`);
    return response.data as {
      countGuestViewsInPublicCounts: boolean;
      publicUniqueViews: number;
      authenticatedUniqueViews: number;
      guestUniqueViewsTotal: number;
      guestUniqueViewsCounted: number;
      guestUniqueViewsExcluded: number;
      guestUniqueViewsNotCountedBySetting: number;
    };
  }

  async updateViewSettings(params: { countGuestViewsInPublicCounts: boolean }): Promise<{ countGuestViewsInPublicCounts: boolean }> {
    const response = await this._apiClient.api.put(`/api/admin/blog/view-settings`, {
      countGuestViewsInPublicCounts: params.countGuestViewsInPublicCounts,
    });
    return response.data as { countGuestViewsInPublicCounts: boolean };
  }

  async excludeGuestViews(): Promise<{ modified: number }> {
    const response = await this._apiClient.api.post(`/api/admin/blog/view-settings/exclude-guest-views`);
    return response.data as { modified: number };
  }

  async restoreGuestViews(): Promise<{ modified: number }> {
    const response = await this._apiClient.api.post(`/api/admin/blog/view-settings/restore-guest-views`);
    return response.data as { modified: number };
  }

  async deleteGuestViews(): Promise<{ deleted: number }> {
    const response = await this._apiClient.api.delete(`/api/admin/blog/view-settings/guest-views`);
    return response.data as { deleted: number };
  }

  async getPostAnalytics(id: string): Promise<AdminBlogPostAnalytics> {
    const response = await this._apiClient.api.get(`/api/admin/blog/posts/${id}/analytics`);
    return response.data as AdminBlogPostAnalytics;
  }

  async getPostsAnalytics(postIds: string[]): Promise<AdminBlogPostAnalytics[]> {
    if (!postIds.length) {
      return [];
    }

    const query = new URLSearchParams();
    query.append("postIds", postIds.join(","));
    const response = await this._apiClient.api.get(`/api/admin/blog/posts/analytics?${query.toString()}`);
    return (response.data?.items ?? []) as AdminBlogPostAnalytics[];
  }

  async getOverviewAnalytics(): Promise<AdminBlogOverviewAnalytics> {
    const response = await this._apiClient.api.get(`/api/admin/blog/analytics/overview`);
    return response.data as AdminBlogOverviewAnalytics;
  }

  async getOverviewBreakdown(params: { metric: string; bucket?: string; emoji?: string }): Promise<AdminBlogBreakdown> {
    const query = new URLSearchParams();
    query.append("metric", params.metric);
    if (params.bucket) {
      query.append("bucket", params.bucket);
    }
    if (params.emoji) {
      query.append("emoji", params.emoji);
    }
    const response = await this._apiClient.api.get(`/api/admin/blog/analytics/breakdown?${query.toString()}`);
    return response.data as AdminBlogBreakdown;
  }
}
