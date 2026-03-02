import type { BlogPost, BlogPostVersion, BlogStatus } from "../types/blog";

export interface IAdminBlogService {
  getPosts(params: {
    page: number;
    pageSize: number;
    status?: BlogStatus | "";
    search?: string;
    tag?: string;
  }): Promise<{ items: BlogPost[]; total: number }>;
  getPost(id: string): Promise<{ post: BlogPost; version: BlogPostVersion }>;
  createPost(payload: AdminBlogPayload): Promise<BlogPost>;
  updatePost(id: string, payload: AdminBlogPayload): Promise<BlogPost>;
  getVersions(id: string): Promise<Array<Pick<BlogPostVersion, "id" | "versionNumber" | "createdAt" | "createdBy" | "changeNote">>>;
  getVersion(id: string, versionId: string): Promise<BlogPostVersion>;
  restoreVersion(id: string, versionId: string, changeNote?: string): Promise<BlogPost>;
  archivePost(id: string): Promise<BlogPost>;
  getHomeSettings(): Promise<{ mainHeroPostId?: string; updatedAt?: string; updatedBy?: string }>;
  setMainHeroPost(postId?: string): Promise<{ mainHeroPostId?: string; updatedAt?: string; updatedBy?: string }>;
}

export type AdminBlogPayload = {
  title: string;
  slug?: string;
  excerpt: string;
  contentMarkdown: string;
  contentHtml?: string;
  coverAssetId?: string;
  tags: string[];
  status: BlogStatus;
  scheduledAt?: string;
  publishedAt?: string;
  readingTime?: number;
  changeNote?: string;
  featured?: boolean;
  blogHomeFeatured?: boolean;
};
