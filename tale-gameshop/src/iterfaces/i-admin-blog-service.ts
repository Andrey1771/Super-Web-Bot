import type { BlogPost, BlogPostVersion, BlogStatus } from "../types/blog";

export type AdminBlogPostAnalytics = {
  postId: string;
  title: string;
  slug: string;
  publicUniqueViews: number;
  authenticatedUniqueViews: number;
  guestUniqueViewsTotal: number;
  guestUniqueViewsCounted: number;
  guestUniqueViewsExcluded: number;
  completedReads: number;
  totalReactions: number;
  reactionsByEmoji: AdminBlogReactionBreakdown;
  topReaction: string;
  viewsTimeline: AdminBlogTimelinePoint[];
  reactionsTimeline: AdminBlogTimelinePoint[];
  latestEvents: AdminBlogLatestEvent[];
};

export type AdminBlogTimelinePoint = {
  bucketStart: string;
  count: number;
  reactionsByEmoji?: AdminBlogReactionBreakdown;
};

export type AdminBlogLatestEvent = {
  timestamp: string;
  actorType: "authenticated" | "guest";
  actorDisplay: string;
  eventType: string;
  reaction?: string;
};

export type AdminBlogReactionBreakdown = {
  "👍": number;
  "❤️": number;
  "🔥": number;
  "🎮": number;
  "👀": number;
};

export type AdminBlogOverviewAnalytics = {
  publicUniqueViews: number;
  authenticatedUniqueViews: number;
  guestUniqueViewsTotal: number;
  guestUniqueViewsCounted: number;
  guestUniqueViewsExcluded: number;
  completedReads: number;
  totalReactions: number;
  topReaction: string;
  reactionsByEmoji: AdminBlogReactionBreakdown;
  topPostsByViews: Array<{ postId: string; title: string; slug: string; views: number }>;
  topPostsByReactions: Array<{ postId: string; title: string; slug: string; reactions: number }>;
  viewsTimeline: AdminBlogTimelinePoint[];
  reactionsTimeline: AdminBlogTimelinePoint[];
  latestEvents: AdminBlogLatestEvent[];
};

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
  getViewSettings(): Promise<{
    countGuestViewsInPublicCounts: boolean;
    publicUniqueViews: number;
    authenticatedUniqueViews: number;
    guestUniqueViewsTotal: number;
    guestUniqueViewsCounted: number;
    guestUniqueViewsExcluded: number;
  }>;
  updateViewSettings(params: { countGuestViewsInPublicCounts: boolean }): Promise<{ countGuestViewsInPublicCounts: boolean }>;
  excludeGuestViews(): Promise<{ modified: number }>;
  deleteGuestViews(): Promise<{ deleted: number }>;
  getPostAnalytics(id: string): Promise<AdminBlogPostAnalytics>;
  getPostsAnalytics(postIds: string[]): Promise<AdminBlogPostAnalytics[]>;
  getOverviewAnalytics(): Promise<AdminBlogOverviewAnalytics>;
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
