export type AccountUser = {
    id?: string;
    displayName?: string;
    email?: string;
    verifiedBuyer?: boolean;
    memberSince?: string;
    avatarUrl?: string | null;
};

export type AccountCounters = {
    ordersCount: number;
    activeKeysCount: number;
    savedItemsCount: number;
    paymentMethodsCount: number;
};

export type AccountRecentOrder = {
    orderId: string;
    gameTitle: string;
    date: string;
    amount?: number | null;
    currency?: string | null;
    status?: string | null;
    invoiceId?: string | null;
};

export type AccountRecentKey = {
    gameTitle: string;
    platform?: string | null;
    purchaseDate?: string | null;
    keyId?: string | null;
    hasKey?: boolean;
};

export type AccountRecommendation = {
    gameId: string;
    title: string;
    price: number;
    coverUrl?: string | null;
    salePercent?: number | null;
};

export type AccountOverview = {
    user: AccountUser;
    counters: AccountCounters;
    recentOrders: AccountRecentOrder[];
    recentKeys: AccountRecentKey[];
    recommendations?: AccountRecommendation[] | null;
};
