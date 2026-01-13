export type AccountOverviewResponse = {
    user: AccountUser;
    counters: AccountCounters;
    recentOrders: AccountOrder[];
    recentKeys: AccountKey[];
    recommendations: AccountRecommendation[];
};

export type AccountUser = {
    id: string;
    displayName: string;
    email: string;
    verifiedBuyer: boolean;
    memberSince: string;
    avatarUrl: string | null;
};

export type AccountCounters = {
    ordersCount: number;
    activeKeysCount: number;
    savedItemsCount: number;
    paymentMethodsCount: number;
};

export type AccountOrder = {
    orderId: string;
    gameTitle: string;
    date: string;
    amount: number | null;
    currency: string | null;
    status: string;
    invoiceId: string | null;
};

export type AccountKey = {
    gameTitle: string;
    platform: string;
    purchaseDate: string;
    keyId: string;
    hasKey: boolean;
};

export type AccountRecommendation = {
    gameId: string;
    title: string;
    price: number;
    coverUrl: string | null;
    salePercent: number;
};
