export type MediaType = 'image' | 'video';

export interface MediaItem {
    id: string;
    type: MediaType;
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

export interface DLCItem {
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
    title: string;
    coverUrl: string;
    price: number;
    rating: number;
}

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

export interface RatingBreakdownItem {
    rating: number;
    percent: number;
}

export interface ReviewSummary {
    score: number;
    reviewCount: number;
    label: string;
    recommendedPercent: number;
    breakdown: RatingBreakdownItem[];
    tags: string[];
}

export interface QuickInfoTile {
    id: string;
    label: string;
    value: string;
    icon: string;
}

export interface AwardsBadge {
    id: string;
    title: string;
    iconUrl: string;
}

export interface DeveloperPublisherInfo {
    developerLogoUrl: string;
    developerUrl: string;
    publisherLogoUrl: string;
    publisherUrl: string;
}

export interface SystemRequirements {
    minimum: string[];
    recommended: string[];
}

export interface GameDetailsViewModel {
    game: GameDetails;
    heroMedia: MediaItem[];
    heroPricing: Pricing;
    badges: string[];
    ratingSummary: ReviewSummary;
    quickInfo: QuickInfoTile[];
    editions: Edition[];
    dlc: DLCItem[];
    developerPublisher: DeveloperPublisherInfo;
    about: {
        paragraphs: string[];
        features: string[];
        awards: AwardsBadge[];
    };
    gameplay: {
        trailer: MediaItem;
        screenshots: MediaItem[];
    };
    details: {
        genres: string[];
        themes: string[];
        modes: string[];
        tags: string[];
        supportedLanguages: string[];
        cloudSaves: string;
    };
    systemRequirements: SystemRequirements;
    reviews: Review[];
    qa: QAItem[];
    recommendations: GameCardItem[];
    recentlyViewed: GameCardItem[];
}
