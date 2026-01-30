import { GameDetailsViewModel } from '../models/game-details';

export const gameDetailsMock: GameDetailsViewModel = {
    game: {
        id: 'game-odyssey',
        slug: 'eternal-odyssey',
        title: 'Eternal Odyssey: Echoes of the Astral Sea',
        tagline: 'Epic open-world RPG adventure',
        description: [
            'Eternal Odyssey invites you into a breathtaking realm of floating kingdoms, ancient temples, and living star-forged myths. Lead a band of explorers as you chart the Astral Sea, where every island hides a story and every decision reshapes the fate of the realm.',
            'Master fluid combat, combine elemental magic with tactical weapons, and forge alliances with mysterious factions. Your choices ripple across a vast world filled with dynamic weather, day-night cycles, and emergent quests that react to how you play.',
            'Whether you venture solo or co-op with friends, Eternal Odyssey delivers a rich narrative journey that rewards curiosity and bold storytelling.'
        ],
        features: [
            'A vast open world filled with diverse and mystical lands to explore.',
            'A deep branching storyline with meaningful player choices.',
            'Dynamic real-time combat with elemental combos and weapon mastery.',
            'Customize your hero with unique skills, gear, and relics.',
            'Epic boss battles and challenging dungeons to conquer.',
            'Photo mode and cinematic replay tools.'
        ],
        awards: [
            'Game Awards Nominee',
            'RPG of the Year',
            'Best Indie',
            'Editor’s Choice'
        ],
        developer: 'Starlight Forge',
        publisher: 'Nova Interactive',
        releaseDate: 'May 19, 2024',
        platforms: ['Windows', 'PlayStation', 'Xbox', 'Mac'],
        genres: ['RPG', 'Action', 'Open World'],
        tags: ['Story Rich', 'Exploration', 'Fantasy', 'Single-player', 'Co-op'],
        themes: ['Mythic', 'Exploration', 'High Fantasy'],
        modes: ['Single-player', 'Online co-op', 'Controller support'],
        supportedLanguages: ['English', 'Spanish', 'German', 'French', 'Japanese', 'Korean', 'Portuguese'],
        cloudSaves: 'Supported'
    },
    heroMedia: [
        {
            id: 'media-1',
            type: 'image',
            url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
            thumbUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=240&q=80'
        },
        {
            id: 'media-2',
            type: 'image',
            url: 'https://images.unsplash.com/photo-1482192505345-5655af888cc4?auto=format&fit=crop&w=900&q=80',
            thumbUrl: 'https://images.unsplash.com/photo-1482192505345-5655af888cc4?auto=format&fit=crop&w=240&q=80'
        },
        {
            id: 'media-3',
            type: 'video',
            url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            thumbUrl: 'https://images.unsplash.com/photo-1526498460520-4c246339dccb?auto=format&fit=crop&w=240&q=80',
            durationSec: 126
        },
        {
            id: 'media-4',
            type: 'image',
            url: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80',
            thumbUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=240&q=80'
        },
        {
            id: 'media-5',
            type: 'video',
            url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
            thumbUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=240&q=80',
            durationSec: 145
        },
        {
            id: 'media-6',
            type: 'image',
            url: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=900&q=80',
            thumbUrl: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=240&q=80'
        }
    ],
    heroPricing: {
        price: 23.99,
        oldPrice: 29.99,
        currency: '$',
        discountPercent: 20
    },
    badges: ['Top rated', 'New', '-20%', 'Steam key'],
    ratingSummary: {
        score: 4.8,
        reviewCount: 12483,
        label: 'Very Positive',
        recommendedPercent: 89,
        breakdown: [
            { rating: 5, percent: 82 },
            { rating: 4, percent: 15 },
            { rating: 3, percent: 2 },
            { rating: 2, percent: 1 },
            { rating: 1, percent: 1 }
        ],
        tags: ['Great story', 'Smooth performance', 'Worth the price']
    },
    quickInfo: [
        { id: 'info-1', label: 'Languages', value: 'English + 12 more', icon: 'language' },
        { id: 'info-2', label: 'Age rating', value: 'Mature 18+', icon: 'age' },
        { id: 'info-3', label: 'Online features', value: 'Co-op, Cloud saves', icon: 'online' },
        { id: 'info-4', label: 'Controller support', value: 'Full', icon: 'controller' }
    ],
    editions: [
        {
            id: 'standard',
            name: 'Standard',
            description: 'Full game',
            pricing: { price: 39.99, oldPrice: 49.99, currency: '$', discountPercent: 20 }
        },
        {
            id: 'deluxe',
            name: 'Deluxe',
            description: 'Soundtrack + artbook',
            pricing: { price: 54.99, oldPrice: 69.99, currency: '$', discountPercent: 20 }
        },
        {
            id: 'ultimate',
            name: 'Ultimate',
            description: 'Season pass + deluxe',
            pricing: { price: 69.99, oldPrice: 89.99, currency: '$', discountPercent: 22 }
        }
    ],
    dlc: [
        {
            id: 'dlc-1',
            title: 'Skybound Adventures Pack',
            coverUrl: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=160&q=80',
            price: 9.99
        },
        {
            id: 'dlc-2',
            title: 'Astral Forge Weapons',
            coverUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=160&q=80',
            price: 14.99
        },
        {
            id: 'dlc-3',
            title: 'Echoes Story Expansion',
            coverUrl: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=160&q=80',
            price: 19.99
        }
    ],
    developerPublisher: {
        developerLogoUrl: 'https://images.unsplash.com/photo-1521790797524-b2497295b8a0?auto=format&fit=crop&w=120&q=80',
        developerUrl: '#',
        publisherLogoUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=120&q=80',
        publisherUrl: '#'
    },
    about: {
        paragraphs: [
            'Eternal Odyssey is a cinematic RPG set across a constellation of floating worlds. Each region introduces new cultures, unique biomes, and secrets that unfold through exploration.',
            'The story adapts to your decisions, weaving relationships with companions and rival factions into a narrative that stays personal yet epic in scope.'
        ],
        features: [
            'Explore vast islands with seamless transitions between sea and sky.',
            'Forge alliances with five distinct factions and unlock narrative arcs.',
            'Command a customizable airship and recruit specialist crew members.',
            'Dive into tactical combat arenas and large-scale world events.',
            'Unlock relics that reshape traversal and puzzle mechanics.'
        ],
        awards: [
            {
                id: 'award-1',
                title: 'Game Awards Nominee',
                iconUrl: 'https://img.icons8.com/fluency/96/trophy.png'
            },
            {
                id: 'award-2',
                title: 'RPG of the Year',
                iconUrl: 'https://img.icons8.com/fluency/96/trophy.png'
            },
            {
                id: 'award-3',
                title: 'Best Indie',
                iconUrl: 'https://img.icons8.com/fluency/96/trophy.png'
            },
            {
                id: 'award-4',
                title: 'Editor’s Choice',
                iconUrl: 'https://img.icons8.com/fluency/96/trophy.png'
            }
        ]
    },
    gameplay: {
        trailer: {
            id: 'trailer-1',
            type: 'video',
            url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            thumbUrl: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=80',
            durationSec: 126
        },
        screenshots: [
            {
                id: 'shot-1',
                type: 'image',
                url: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80',
                thumbUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=400&q=80'
            },
            {
                id: 'shot-2',
                type: 'image',
                url: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=80',
                thumbUrl: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=400&q=80'
            },
            {
                id: 'shot-3',
                type: 'image',
                url: 'https://images.unsplash.com/photo-1482192505345-5655af888cc4?auto=format&fit=crop&w=1200&q=80',
                thumbUrl: 'https://images.unsplash.com/photo-1482192505345-5655af888cc4?auto=format&fit=crop&w=400&q=80'
            },
            {
                id: 'shot-4',
                type: 'image',
                url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
                thumbUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=400&q=80'
            },
            {
                id: 'shot-5',
                type: 'image',
                url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80',
                thumbUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=400&q=80'
            },
            {
                id: 'shot-6',
                type: 'image',
                url: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1200&q=80',
                thumbUrl: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=400&q=80'
            }
        ]
    },
    details: {
        genres: ['RPG', 'Action', 'Adventure', 'Fantasy'],
        themes: ['Medieval', 'Magic', 'Dark Fantasy'],
        modes: ['Single-player', 'Online co-op', 'Cloud saves'],
        tags: ['Open World', 'Story Rich', 'Exploration', 'Companions'],
        supportedLanguages: ['English', 'Spanish', 'French', 'German', 'Japanese', 'Korean'],
        cloudSaves: 'Supported'
    },
    systemRequirements: {
        minimum: [
            'OS: Windows 10 64-bit',
            'Processor: Intel i5-8400 / Ryzen 5 2600',
            'Memory: 16 GB RAM',
            'Graphics: GTX 1060 / RX 580',
            'Storage: 90 GB available space'
        ],
        recommended: [
            'OS: Windows 11 64-bit',
            'Processor: Intel i7-10700 / Ryzen 7 3700X',
            'Memory: 32 GB RAM',
            'Graphics: RTX 2070 / RX 6700 XT',
            'Storage: 90 GB SSD'
        ]
    },
    reviews: [
        {
            id: 'review-1',
            userName: 'ArcherX',
            avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&q=80',
            verified: true,
            rating: 5,
            playtimeHours: 66.2,
            text: 'Absolutely incredible! One of the best RPGs I’ve played in years. The world is vast and beautiful, with tons of quests and secrets to discover. Story is engaging, and the combat feels satisfying and responsive.',
            createdAt: '2 days ago',
            helpfulCount: 168
        },
        {
            id: 'review-2',
            userName: 'LunaMae',
            avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
            verified: true,
            rating: 5,
            playtimeHours: 34.4,
            text: 'The exploration loop is top-notch. I love how the quests react to the choices you make, and the soundtrack is pure magic. Co-op runs have been smooth and super fun.',
            createdAt: '5 days ago',
            helpfulCount: 94,
            screenshotUrl: 'https://images.unsplash.com/photo-1482192505345-5655af888cc4?auto=format&fit=crop&w=300&q=80'
        },
        {
            id: 'review-3',
            userName: 'NovaKnight',
            verified: false,
            rating: 4,
            playtimeHours: 12.4,
            text: 'Great story and visuals, but the UI can feel a bit dense at first. Once you get the hang of it, the combat really shines. Worth the price for the content.',
            createdAt: '1 week ago',
            helpfulCount: 56
        },
        {
            id: 'review-4',
            userName: 'PixelRose',
            avatarUrl: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=120&q=80',
            verified: true,
            rating: 5,
            playtimeHours: 48.9,
            text: 'The art direction is stunning. Every region feels handcrafted, and the side quests are genuinely memorable. Highly recommend if you enjoy deep lore and exploration.',
            createdAt: '2 weeks ago',
            helpfulCount: 77
        },
        {
            id: 'review-5',
            userName: 'Mistral',
            avatarUrl: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=120&q=80',
            verified: true,
            rating: 4,
            playtimeHours: 22.1,
            text: 'Really solid. Some performance dips in crowded areas, but patches have improved it. The companion system is excellent and adds a lot of personality.',
            createdAt: '3 weeks ago',
            helpfulCount: 41
        }
    ],
    qa: [
        {
            id: 'qa-1',
            question: 'Is there multiplayer co-op?',
            answer: 'Yes, it supports two-player online co-op with shared progress.',
            createdAt: '2 days ago'
        },
        {
            id: 'qa-2',
            question: 'Will there be more DLCs in the future?',
            answer: 'Yes! The developers confirmed new content coming later this year.',
            createdAt: '5 days ago'
        },
        {
            id: 'qa-3',
            question: 'Does it support ultrawide monitors?',
            answer: 'Ultrawide 21:9 and 32:9 are supported in the latest patch.',
            createdAt: '1 week ago'
        }
    ],
    recommendations: [
        {
            id: 'rec-1',
            title: 'Dragon Realms',
            coverUrl: 'https://images.unsplash.com/photo-1495567720989-cebdbdd97913?auto=format&fit=crop&w=600&q=80',
            price: 24.99,
            rating: 4.7
        },
        {
            id: 'rec-2',
            title: 'Kingdoms of Eldoria',
            coverUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=600&q=80',
            price: 44.99,
            rating: 4.6
        },
        {
            id: 'rec-3',
            title: 'Elden Sands',
            coverUrl: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=600&q=80',
            price: 39.99,
            rating: 4.8
        },
        {
            id: 'rec-4',
            title: 'Darkest Skies',
            coverUrl: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=600&q=80',
            price: 33.99,
            rating: 4.4
        },
        {
            id: 'rec-5',
            title: 'Valiant Quest',
            coverUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=600&q=80',
            price: 19.99,
            rating: 4.5
        },
        {
            id: 'rec-6',
            title: 'Shadow Arcanum',
            coverUrl: 'https://images.unsplash.com/photo-1526498460520-4c246339dccb?auto=format&fit=crop&w=600&q=80',
            price: 29.99,
            rating: 4.3
        }
    ],
    recentlyViewed: [
        {
            id: 'rec-7',
            title: 'Nebula Frontier',
            coverUrl: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=600&q=80',
            price: 14.99,
            rating: 4.1
        },
        {
            id: 'rec-8',
            title: 'Mystic Horizon',
            coverUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=80',
            price: 21.99,
            rating: 4.2
        }
    ]
};

// TODO: Replace mock data with real API response when Game Details endpoint is available.
