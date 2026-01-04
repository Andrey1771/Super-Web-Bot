export interface GameCategory
{
    tag: string;
    title: string;
    description?: string;
}

export interface Settings {
    id: string;
    gameCategories: GameCategory[];
}
