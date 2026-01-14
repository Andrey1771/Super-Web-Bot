import bestGamingImage from '../../assets/images/best-gaming-platform.jpg';
import virtualImage from '../../assets/images/virtual.jpg';
import oneMillionUsersImage from '../../assets/images/one-million-users.jpg';
import taleShopPromoImage from '../../assets/images/tale-shop-under-construction.png';

export type AccountOrder = {
    id: string;
    game: string;
    date: string;
    amount: string;
};

export type AccountKey = {
    id: string;
    game: string;
    platform: string;
    date: string;
};

export type AccountRecommendation = {
    id: string;
    title: string;
    price: number;
    image: string;
};

export const accountProfile = {
    initials: 'AR',
    name: 'Alex R.',
    email: 'holhov908@gmail.com',
    badge: 'Verified buyer',
    memberSince: '2025'
};

const recentOrders: AccountOrder[] = [
    {id: '#170582', game: 'Elden Ring', date: 'April 15, 2024', amount: '$59.99'},
    {id: '#169741', game: 'Hades II', date: 'April 5, 2024', amount: '$29.99'},
    {id: '#154879', game: 'Cyberpunk 2077', date: 'March 22, 2024', amount: '$39.99'}
];

const recentKeys: AccountKey[] = [
    {id: 'key-elden-ring', game: 'Elden Ring', platform: 'Steam', date: 'April 15, 2024'},
    {id: 'key-hades-2', game: 'Hades II', platform: 'Steam', date: 'April 5, 2024'}
];

const recommendations: AccountRecommendation[] = [
    {id: 'rec-dying-light-2', title: 'Dying Light 2', price: 19.99, image: bestGamingImage},
    {id: 'rec-dark-souls', title: 'Dark Souls', price: 59.99, image: virtualImage},
    {id: 'rec-the-witcher', title: 'The Witcher', price: 29.99, image: taleShopPromoImage},
    {id: 'rec-god-of-war', title: 'God of War', price: 49.99, image: oneMillionUsersImage}
];

export const accountQuickStats = {
    orders: '12 orders',
    keys: '3 active keys',
    saved: '48 items',
    billing: '2 methods'
};

export const getRecentOrders = () => recentOrders;
export const getRecentKeys = () => recentKeys;
export const getRecommendations = () => recommendations;
