export type BlogStatus = "DRAFT" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED";

/** Переводы поля админки: язык (ru/uk/pl) → текст; английское поле рядом — основное. */
export type I18nText = Record<string, string>;

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  titleI18n?: I18nText | null;
  excerptI18n?: I18nText | null;
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
  /** Переводы тегов по позициям (язык → список той же длины) — только в админке. */
  tagsI18n?: Record<string, string[]> | null;
  /** Подписи тегов на языке сайта по позициям — приходят с витринных маршрутов. */
  tagLabels?: string[];
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
  titleI18n?: I18nText | null;
  excerptI18n?: I18nText | null;
  contentMarkdownI18n?: I18nText | null;
  contentHtmlI18n?: I18nText | null;
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
  tagLabels?: string[];
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

export type BlogComment = {
  id: string;
  authorName: string;
  text: string;
  createdAt: string;
};

export type BlogCommentsResponse = {
  items: BlogComment[];
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
