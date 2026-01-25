import type { BlogListResponse, BlogPost, BlogPostVersion } from "../types/blog";

export interface IBlogService {
  getPosts(params: { page: number; pageSize: number; tag?: string; search?: string }): Promise<BlogListResponse>;
  getPostBySlug(slug: string): Promise<{ post: BlogPost; version: BlogPostVersion }>;
}
