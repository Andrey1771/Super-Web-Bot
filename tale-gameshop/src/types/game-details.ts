export interface GameDetails {
  id?: string;
  gameId: string;
  slug: string;
  title: string;
  tagline: string;
  descriptionMarkdown: string;
  cover?: GameCover;
  gallery: MediaItem[];
  genres: string[];
  tags: string[];
  developer?: GameStudioInfo;
  publisher?: GameStudioInfo;
  releaseDate?: string;
  platforms: GamePlatforms;
  languages: GameLanguageSupport;
  ageRating?: GameAgeRating;
  onlineFeatures: string[];
  controllerSupport: 'None' | 'Partial' | 'Full';
  cloudSavesSupported: boolean;
  basePrice: number;
  discountPercent?: number;
  currency: string;
  finalPrice: number;
  isActive: boolean;
  isNew: boolean;
  isTopRated: boolean;
  keyType: string;
  keyFeatures: string[];
  awards: AwardBadge[];
  editions: Edition[];
  dlcItems: DLC[];
  systemRequirements: GameSystemRequirements;
  similarGameIds: string[];
  autoRecommendRules: GameAutoRecommendRules;
  ratingAvg: number;
  reviewsCount: number;
}

export interface GameCover {
  url: string;
  alt?: string;
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbUrl: string;
  posterUrl?: string;
  durationSec?: number;
  title?: string;
  caption?: string;
  isTrailer?: boolean;
  width?: number;
  height?: number;
  order?: number;
}

export interface Pricing {
  price: number;
  oldPrice?: number;
  currency: string;
  discountPercent?: number;
}

export interface Edition {
  code: string;
  title: string;
  description: string;
  price: number;
  discountPercent?: number;
  includedItems?: string[];
  isDefault?: boolean;
}

export interface DLC {
  id: string;
  title: string;
  coverUrl: string;
  price: number;
  discountPercent?: number;
  isBundle?: boolean;
}

export interface Review {
  id: string;
  userName: string;
  avatarUrl?: string;
  verifiedPurchase: boolean;
  rating: number;
  playtimeHours?: number;
  text: string;
  createdAt: string;
  helpfulCount: number;
  images?: { url: string; thumbUrl: string }[];
  recommend?: boolean;
}

export interface QAItem {
  id: string;
  question: string;
  answer?: string;
  createdAt: string;
  answers?: QAAnswer[];
}

export interface QAAnswer {
  id: string;
  userName: string;
  text: string;
  createdAt: string;
}

export interface GameCardItem {
  id: string;
  slug: string;
  title: string;
  coverUrl: string;
  price: number;
  rating: number;
}

export interface RatingBreakdownItem {
  rating: number;
  percent: number;
}

export interface ReviewTag {
  id: string;
  label: string;
}

export interface QuickInfoTile {
  id: string;
  label: string;
  value: string;
  icon: string;
}

export interface DetailRow {
  id: string;
  label: string;
  value: string | string[];
}

export interface GamePlatforms {
  windows: boolean;
  mac: boolean;
  linux: boolean;
}

export interface GameLanguageSupport {
  audio: string[];
  text: string[];
}

export interface GameAgeRating {
  system: string;
  label: string;
  iconUrl?: string;
}

export interface GameStudioInfo {
  name: string;
  website?: string;
  logoUrl?: string;
}

export interface AwardBadge {
  title: string;
  year?: number;
  type?: string;
  iconUrl?: string;
}

export interface GameSystemRequirements {
  windows: GameSystemRequirementBlock;
  mac?: GameSystemRequirementBlock;
  linux?: GameSystemRequirementBlock;
}

export interface GameSystemRequirementBlock {
  minimum: GameSystemRequirementSpec;
  recommended?: GameSystemRequirementSpec;
}

export interface GameSystemRequirementSpec {
  os?: string;
  cpu?: string;
  ram?: string;
  gpu?: string;
  storage?: string;
  notes?: string;
}

export interface GameAutoRecommendRules {
  enabled: boolean;
  byGenres: boolean;
  byTags: boolean;
  byPublisher: boolean;
}

export interface RatingSummaryResponse {
  avg: number;
  count: number;
  distribution: Record<string, number>;
}

export interface GameRecommendationsResponse {
  moreLikeThis: GameCardItem[];
  recentlyViewed?: GameCardItem[];
}

export interface GameUserContext {
  isWishlisted: boolean;
  hasPurchased: boolean;
  myReview?: Review;
}

export interface GameDetailsResponse {
  game: GameDetails;
  pricing: Pricing;
  ratingSummary: RatingSummaryResponse;
  heroBadges: string[];
  recommendations: GameRecommendationsResponse;
  userContext: GameUserContext;
}
