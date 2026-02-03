export interface GameDetails {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string[];
  features: string[];
  awards: string[];
  developer: string;
  publisher: string;
  releaseDate: string;
  platforms: string[];
  genres: string[];
  tags: string[];
  themes: string[];
  modes: string[];
  supportedLanguages: string[];
  cloudSaves: string;
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbUrl: string;
  durationSec?: number;
}

export interface Pricing {
  price: number;
  oldPrice?: number;
  currency: string;
  discountPercent?: number;
}

export interface Edition {
  id: string;
  name: string;
  description: string;
  pricing: Pricing;
}

export interface DLC {
  id: string;
  title: string;
  coverUrl: string;
  price: number;
}

export interface Review {
  id: string;
  userName: string;
  avatarUrl?: string;
  verified: boolean;
  rating: number;
  playtimeHours?: number;
  text: string;
  createdAt: string;
  helpfulCount: number;
  screenshotUrl?: string;
}

export interface QAItem {
  id: string;
  question: string;
  answer: string;
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

export interface SystemRequirement {
  id: string;
  label: string;
  value: string;
}

export interface DeveloperPublisherInfo {
  id: string;
  name: string;
  logoUrl: string;
  website: string;
}

export interface GameDetailsViewModel {
  game: GameDetails;
  media: MediaItem[];
  pricing: Pricing;
  editions: Edition[];
  dlc: DLC[];
  reviews: Review[];
  qa: QAItem[];
  recommendations: GameCardItem[];
  screenshotGallery: string[];
  trailerUrl: string;
  ratingSummary: {
    average: number;
    totalReviews: number;
    label: string;
  };
  ratingBreakdown: RatingBreakdownItem[];
  reviewTags: ReviewTag[];
  quickInfoTiles: QuickInfoTile[];
  detailRows: DetailRow[];
  systemRequirements: SystemRequirement[];
  developerPublisher: DeveloperPublisherInfo[];
}
