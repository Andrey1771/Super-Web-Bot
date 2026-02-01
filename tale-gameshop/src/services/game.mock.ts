import type { Game } from '../models/game';

export const gamesMock: Game[] = [
    {
        id: 'game-1',
        name: 'Eternal Odyssey',
        title: 'Eternal Odyssey: Echoes of the Astral Sea',
        description: 'An epic open-world RPG adventure across floating kingdoms.',
        price: 23.99,
        gameType: 0,
        imagePath: '/assets/images/tale-shop-under-construction.png',
        releaseDate: '2024-05-19'
    },
    {
        id: 'game-2',
        name: 'Dragon Realms',
        title: 'Dragon Realms',
        description: 'A tactical RPG with sweeping landscapes and ancient legends.',
        price: 24.99,
        gameType: 0,
        imagePath: '/assets/images/tale-shop-under-construction.png',
        releaseDate: '2023-11-02'
    },
    {
        id: 'game-3',
        name: 'Kingdoms of Eldoria',
        title: 'Kingdoms of Eldoria',
        description: 'Lead your realm through diplomacy, war, and arcane discoveries.',
        price: 44.99,
        gameType: 1,
        imagePath: '/assets/images/tale-shop-under-construction.png',
        releaseDate: '2024-01-12'
    },
    {
        id: 'game-4',
        name: 'Valiant Quest',
        title: 'Valiant Quest',
        description: 'A story-rich adventure with fast-paced combat.',
        price: 19.99,
        gameType: 2,
        imagePath: '/assets/images/tale-shop-under-construction.png',
        releaseDate: '2022-08-04'
    },
    {
        id: 'game-5',
        name: 'Mystic Horizon',
        title: 'Mystic Horizon',
        description: 'Explore a luminous world shaped by ancient magic.',
        price: 21.99,
        gameType: 2,
        imagePath: '/assets/images/tale-shop-under-construction.png',
        releaseDate: '2023-03-16'
    },
    {
        id: 'game-6',
        name: 'Shadow Arcanum',
        title: 'Shadow Arcanum',
        description: 'Dark fantasy action RPG with co-op hunts.',
        price: 29.99,
        gameType: 1,
        imagePath: '/assets/images/tale-shop-under-construction.png',
        releaseDate: '2024-09-30'
    }
];

// TODO: Replace mock games with API response when Games endpoint is available.
