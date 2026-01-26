import { injectable } from "inversify";
import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";
import type { IAdminBlogService, AdminBlogPayload } from "../iterfaces/i-admin-blog-service";
import type { BlogPost, BlogPostVersion, BlogStatus } from "../types/blog";

@injectable()
export class AdminBlogService implements IAdminBlogService {
  private readonly _apiClient: IApiClient;

  constructor() {
    this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
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
}
