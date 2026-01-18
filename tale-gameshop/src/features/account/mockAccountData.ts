
export type AccountOrder = {
    id: string;
    game: string;
    date: string;
    amount: string;
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



export const accountQuickStats = {
    orders: '12 orders',
    keys: '3 active keys',
    saved: '48 items',
    billing: '2 methods'
};

export const getRecentOrders = () => recentOrders;
