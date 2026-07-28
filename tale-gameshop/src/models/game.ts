export interface Game {
    id?: string;
    slug?: string;
    name: string;
    description: string;
    price: number;
    finalPrice?: number;
    discountPercent?: number;
    discountActive?: boolean;
    genres?: string[];
    platforms?: string[];
    ratingAvg?: number;
    reviewsCount?: number;
    showInFeaturedStorefront?: boolean;
    featuredStorefrontPriority?: number;
    title: string;
    gameType: number;
    imagePath: string;
    releaseDate: string;
}
