export interface GameCategory
{
    tag: string;
    title: string;
    description?: string;
    icon?: string;
    collapsed?: boolean;
}

export interface Settings {
    id: string;
    gameCategories: GameCategory[];
}
