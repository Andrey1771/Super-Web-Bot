import { GameDetailsViewModel } from '../types/game-details';

// TODO: Replace this mock with real API data when the game details endpoint is available.
export const gameDetailsMock: GameDetailsViewModel = {
  game: {
    id: 'game-001',
    slug: 'the-witcher-3-wild-hunt',
    title: 'The Witcher 3: Wild Hunt — Complete Edition with Bonus Story Chapters',
    tagline: 'Epic open-world RPG adventure with next-gen enhancements',
    description: [
      'Enter a living, breathing fantasy realm where every choice you make shapes the fate of kingdoms. Track ancient monsters, unravel political intrigue, and forge alliances across bustling cities and forgotten wilderness.',
      'With hundreds of quests, fully voiced characters, and a dynamic world that reacts to your actions, this definitive edition blends the base game with major expansions, refined combat, and cinematic storytelling.',
      'Experience upgraded visuals, quality-of-life improvements, and seamless progression across story arcs designed to keep you immersed for dozens of hours.'
    ],
    features: [
      'An open world packed with handcrafted quests and rich lore',
      'Branching narrative choices with lasting consequences',
      'Reimagined combat and exploration tools',
      'Two massive story expansions included',
      'Next-gen enhancements and performance modes'
    ],
    awards: ['Game Awards Nominee', 'RPG Community Choice', 'Best Narrative', 'Editor’s Pick'],
    developer: 'CD Projekt Red',
    publisher: 'CD Projekt',
    releaseDate: 'May 19, 2015',
    platforms: ['Windows', 'PlayStation', 'Xbox', 'Mac'],
    genres: ['RPG', 'Action', 'Open World'],
    tags: ['Story Rich', 'Choices Matter', 'Adventure', 'Fantasy'],
    themes: ['Medieval', 'Dark Fantasy', 'Mythology'],
    modes: ['Single-player', 'Cloud saves'],
    supportedLanguages: ['English', 'Polish', 'French', 'German', 'Japanese'],
    cloudSaves: 'Supported'
  },
  media: [
    {
      id: 'media-1',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1526657782461-9fe13402a841?auto=format&fit=crop&w=900&q=80',
      thumbUrl: 'https://images.unsplash.com/photo-1526657782461-9fe13402a841?auto=format&fit=crop&w=240&q=80'
    },
    {
      id: 'media-2',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=80',
      thumbUrl: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=240&q=80'
    },
    {
      id: 'media-3',
      type: 'video',
      url: 'https://www.w3schools.com/html/mov_bbb.mp4',
      thumbUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=240&q=80',
      posterUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
      durationSec: 126
    },
    {
      id: 'media-4',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
      thumbUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=240&q=80'
    },
    {
      id: 'media-5',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=80',
      thumbUrl: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=240&q=80'
    }
  ],
  pricing: {
    price: 23.99,
    oldPrice: 29.99,
    currency: 'USD',
    discountPercent: 20
  },
  editions: [
    {
      id: 'standard',
      name: 'Standard',
      description: 'Full base game experience',
      pricing: { price: 39.99, oldPrice: 49.99, currency: 'USD', discountPercent: 20 }
    },
    {
      id: 'deluxe',
      name: 'Deluxe',
      description: 'Soundtrack + artbook + bonus gear',
      pricing: { price: 54.99, oldPrice: 69.99, currency: 'USD', discountPercent: 21 }
    },
    {
      id: 'ultimate',
      name: 'Ultimate',
      description: 'All expansions + future content',
      pricing: { price: 69.99, oldPrice: 89.99, currency: 'USD', discountPercent: 22 }
    }
  ],
  dlc: [
    {
      id: 'dlc-1',
      title: 'Hearts of Stone',
      coverUrl: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=240&q=80',
      price: 19.99
    },
    {
      id: 'dlc-2',
      title: 'Blood and Wine',
      coverUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=240&q=80',
      price: 19.99
    },
    {
      id: 'dlc-3',
      title: 'Alternative Looks Pack',
      coverUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=240&q=80',
      price: 4.99
    }
  ],
  reviews: [
    {
      id: 'review-1',
      userName: 'ArcherX',
      avatarUrl: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=120&q=80',
      verified: true,
      rating: 5,
      playtimeHours: 62.2,
      text: 'Absolutely incredible! One of the best RPGs I have ever played. The world is vast and beautiful, the story is engaging, and the combat is fluid and satisfying.',
      createdAt: '2 days ago',
      helpfulCount: 168
    },
    {
      id: 'review-2',
      userName: 'NovaByte',
      avatarUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=120&q=80',
      verified: true,
      rating: 5,
      playtimeHours: 18.4,
      text: 'The expansions feel like full games and the side quests are memorable. Performance is smooth and the art direction is stunning.',
      createdAt: '5 days ago',
      helpfulCount: 92,
      screenshotUrl: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=400&q=80'
    },
    {
      id: 'review-3',
      userName: 'Lyra',
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
      verified: false,
      rating: 4,
      playtimeHours: 40.8,
      text: 'A huge world with so much to discover. Some quests feel slow, but the narrative payoff makes it worth it.',
      createdAt: '1 week ago',
      helpfulCount: 54
    },
    {
      id: 'review-4',
      userName: 'PixelNomad',
      avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&q=80',
      verified: true,
      rating: 5,
      playtimeHours: 120.5,
      text: 'This is the gold standard for modern RPGs. Choices matter and the world reacts in believable ways.',
      createdAt: '2 weeks ago',
      helpfulCount: 211
    },
    {
      id: 'review-5',
      userName: 'Riven',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
      verified: false,
      rating: 4,
      playtimeHours: 9.3,
      text: 'Great story and visuals. I would love more accessibility options, but overall it is an easy recommendation.',
      createdAt: '3 weeks ago',
      helpfulCount: 33
    }
  ],
  qa: [
    {
      id: 'qa-1',
      question: 'Is there multiplayer co-op?',
      answer: 'No, this edition focuses on a single-player narrative experience.',
      createdAt: '2 days ago'
    },
    {
      id: 'qa-2',
      question: 'Will there be more DLC in the future?',
      answer: 'The complete edition includes all planned expansions and bonus content.',
      createdAt: '5 days ago'
    },
    {
      id: 'qa-3',
      question: 'Does it support cloud saves?',
      answer: 'Yes, cloud saves are supported across PC platforms.',
      createdAt: '1 week ago'
    }
  ],
  recommendations: [
    {
      id: 'rec-1',
      slug: 'dragon-realms',
      title: 'Dragon Realms',
      coverUrl: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=520&q=80',
      price: 24.99,
      rating: 4.7
    },
    {
      id: 'rec-2',
      slug: 'kingdoms-fall',
      title: 'Kingdoms of the North',
      coverUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=520&q=80',
      price: 44.99,
      rating: 4.6
    },
    {
      id: 'rec-3',
      slug: 'elden-ring',
      title: 'Elden Ring',
      coverUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=520&q=80',
      price: 39.99,
      rating: 4.9
    },
    {
      id: 'rec-4',
      slug: 'darkest-spires',
      title: 'Darkest Spires',
      coverUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=520&q=80',
      price: 33.99,
      rating: 4.4
    },
    {
      id: 'rec-5',
      slug: 'valiant-quest',
      title: 'Valiant Quest',
      coverUrl: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=520&q=80',
      price: 19.99,
      rating: 4.3
    },
    {
      id: 'rec-6',
      slug: 'shadow-arcana',
      title: 'Shadow of Arcana',
      coverUrl: 'https://images.unsplash.com/photo-1482192596544-9eb780fc7f66?auto=format&fit=crop&w=520&q=80',
      price: 29.99,
      rating: 4.5
    }
  ],
  screenshotGallery: [
    'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=860&q=80',
    'https://images.unsplash.com/photo-1526657782461-9fe13402a841?auto=format&fit=crop&w=860&q=80',
    'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=860&q=80',
    'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=860&q=80',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=860&q=80',
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=860&q=80'
  ],
  trailerUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
  ratingSummary: {
    average: 4.8,
    totalReviews: 12483,
    label: 'Very Positive'
  },
  ratingBreakdown: [
    { rating: 5, percent: 82 },
    { rating: 4, percent: 15 },
    { rating: 3, percent: 2 },
    { rating: 2, percent: 1 },
    { rating: 1, percent: 1 }
  ],
  reviewTags: [
    { id: 'tag-1', label: 'Great story' },
    { id: 'tag-2', label: 'Smooth performance' },
    { id: 'tag-3', label: 'Worth the price' }
  ],
  quickInfoTiles: [
    { id: 'tile-1', label: 'Languages', value: 'English + 12 more', icon: 'language' },
    { id: 'tile-2', label: 'Age rating', value: 'Mature 18+', icon: 'age' },
    { id: 'tile-3', label: 'Online features', value: 'Single-player', icon: 'online' },
    { id: 'tile-4', label: 'Controller support', value: 'Full', icon: 'controller' }
  ],
  detailRows: [
    { id: 'detail-genre', label: 'Genre', value: 'RPG, Adventure, Fantasy' },
    { id: 'detail-themes', label: 'Themes', value: 'Medieval, Magic, Dark Fantasy' },
    { id: 'detail-modes', label: 'Modes', value: 'Single-player, Cloud saves' },
    { id: 'detail-tags', label: 'Tags', value: 'Open World, Story Rich, Exploration' },
    { id: 'detail-languages', label: 'Supported languages', value: 'English, Polish, French, German' },
    { id: 'detail-cloud', label: 'Cloud saves', value: 'Supported' }
  ],
  systemRequirements: [
    { id: 'req-1', label: 'OS', value: 'Windows 10 64-bit' },
    { id: 'req-2', label: 'Processor', value: 'Intel Core i5-7400 / Ryzen 5 1600' },
    { id: 'req-3', label: 'Memory', value: '16 GB RAM' },
    { id: 'req-4', label: 'Graphics', value: 'NVIDIA GTX 1060 / AMD RX 580' },
    { id: 'req-5', label: 'Storage', value: '70 GB available space' }
  ],
  developerPublisher: [
    {
      id: 'dev-1',
      name: 'CD Projekt Red',
      logoUrl: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=160&q=80',
      website: 'https://www.cdprojektred.com'
    },
    {
      id: 'pub-1',
      name: 'CD Projekt',
      logoUrl: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=160&q=80',
      website: 'https://www.cdprojekt.com'
    }
  ]
};
