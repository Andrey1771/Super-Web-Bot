export type AccountOrderItem = {
    gameId?: string;
    title: string;
    coverUrl?: string;
    qty: number;
};

export type AccountOrder = {
    orderId: string;
    createdAt: string;
    status: string;
    currency: string;
    total: number;
    items: AccountOrderItem[];
    hasInvoice: boolean;
    invoiceId?: string;
    keysAvailable: boolean;
    keysCount: number;
};

export type AccountOrdersResponse = {
    items: AccountOrder[];
    page: number;
    pageSize: number;
    total: number;
};
