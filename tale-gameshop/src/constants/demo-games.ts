import {Game} from "../models/game";
import {GameCategory, Settings} from "../models/settings";

export const DEFAULT_GAME_CATEGORIES: GameCategory[] = [
    {tag: 'action', title: 'Action'},
    {tag: 'adventure', title: 'Adventure'},
    {tag: 'rpg', title: 'RPG'},
    {tag: 'strategy', title: 'Strategy'},
    {tag: 'sports', title: 'Sports'},
    {tag: 'indie', title: 'Indie'},
];

export const DEMO_SETTINGS: Settings = {
    id: 'demo',
    gameCategories: DEFAULT_GAME_CATEGORIES
};

export const DEMO_GAMES: Game[] = [
    {
        id: 'demo-1',
        name: 'Neon Skies',
        title: 'Neon Skies',
        description: 'Fast-paced sci-fi shooter set in vibrant neon cities.',
        price: 29.99,
        gameType: 0,
        imagePath: '/images/game-placeholder.svg',
        releaseDate: '2024-11-10'
    },
    {
        id: 'demo-2',
        name: 'Mythic Paths',
        title: 'Mythic Paths',
        description: 'Adventure across ancient ruins with cooperative puzzles.',
        price: 34.99,
        gameType: 1,
        imagePath: '/images/game-placeholder.svg',
        releaseDate: '2024-09-02'
    },
    {
        id: 'demo-3',
        name: 'Eclipse Saga',
        title: 'Eclipse Saga',
        description: 'Character-driven RPG with branching storylines.',
        price: 49.99,
        gameType: 2,
        imagePath: '/images/game-placeholder.svg',
        releaseDate: '2024-08-18'
    },
    {
        id: 'demo-4',
        name: 'Iron Tactics',
        title: 'Iron Tactics',
        description: 'Modern strategy with base building and ranked play.',
        price: 39.99,
        gameType: 3,
        imagePath: '/images/game-placeholder.svg',
        releaseDate: '2024-07-04'
    },
    {
        id: 'demo-5',
        name: 'Street Goal',
        title: 'Street Goal',
        description: 'Street football tournaments with arcade physics.',
        price: 24.99,
        gameType: 4,
        imagePath: '/images/game-placeholder.svg',
        releaseDate: '2024-06-14'
    },
    {
        id: 'demo-6',
        name: 'Pixel Foundry',
        title: 'Pixel Foundry',
        description: 'Indie sandbox about crafting and automation.',
        price: 19.99,
        gameType: 5,
        imagePath: '/images/game-placeholder.svg',
        releaseDate: '2024-05-25'
    }
];
