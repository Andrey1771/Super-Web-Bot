export type BlogStatus = "DRAFT" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverAssetId?: string;
  coverUrl?: string;
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
  editorScore?: number;
  featured?: boolean;
  mainFeatured?: boolean;
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
  tags: string[];
  publishedAt?: string;
  readingTime?: number;
  featured?: boolean;
  mainFeatured?: boolean;
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
