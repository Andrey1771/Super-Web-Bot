export interface Game {
    id?: string;
    slug?: string;
    name: string;
    description: string;
    price: number;
    finalPrice?: number;
    discountPercent?: number;
    discountActive?: boolean;
    title: string;
    gameType: number;
    imagePath: string;
    releaseDate: string;
}
