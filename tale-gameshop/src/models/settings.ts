export interface GameCategory
{
    tag: string;
    title: string;
}

export interface Settings {
    id: string;
    gameCategories: GameCategory[];
}