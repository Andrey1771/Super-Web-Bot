import type { Settings } from '../models/settings';

export const settingsMock: Settings[] = [
    {
        id: 'default-settings',
        gameCategories: [
            { tag: 'rpg', title: 'RPG' },
            { tag: 'action', title: 'Action' },
            { tag: 'adventure', title: 'Adventure' },
            { tag: 'strategy', title: 'Strategy' },
            { tag: 'sim', title: 'Simulation' },
            { tag: 'sports', title: 'Sports' }
        ]
    }
];

// TODO: Replace mock settings with API response when Settings endpoint is available.
