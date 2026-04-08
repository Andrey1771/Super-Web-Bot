export type BlogStatus = "DRAFT" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverAssetId?: string;
  coverUrl?: string;
  imageUrl?: string;
  status: BlogStatus;
  publishedAt?: string;
  scheduledAt?: string;
  createdAt: string;
  updatedAt: string;
  authorId?: string;
  authorName?: string;
  tags: string[];
  topics?: string[];
  readingTime?: number;
  currentVersionId: string;
  viewCount?: number;
  completedReadsCount?: number;
  editorScore?: number;
  featured?: boolean;
  blogHomeFeatured?: boolean;
};

export type BlogPostVersion = {
  id: string;
  postId: string;
  versionNumber: number;
  title: string;
  excerpt: string;
  contentHtml?: string;
  contentMarkdown?: string;
  coverAssetId?: string;
  createdAt: string;
  createdBy?: string;
  changeNote?: string;
};

export type BlogListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl?: string;
  imageUrl?: string;
  tags: string[];
  publishedAt?: string;
  readingTime?: number;
  viewsCount?: number;
  completedReadsCount?: number;
};

export type BlogRecommendationsResponse = {
  heroPost?: BlogListItem;
  latestPosts: BlogListItem[];
  popularThisWeek: BlogListItem[];
  editorsPicks: BlogListItem[];
  forYou: BlogListItem[];
};

export type BlogListResponse = {
  items: BlogListItem[];
  total: number;
};

export type BlogEngagementSummary = {
  postId: string;
  viewsCount: number;
  completedReadsCount: number;
  reactions: Record<string, number>;
  totalReactions: number;
  myReaction?: string;
};

export type BlogPostStats = {
  postId: string;
  viewsCount: number;
  completedReadsCount: number;
  updatedAt?: string;
};
