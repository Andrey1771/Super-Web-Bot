export type Order = {
    id: string;
    gameId: string;
    gameName: string;
    userName: string;
    isPaid: boolean;
    isFulfilled: boolean;
    orderDate: string;
    totalAmount: number;
    currency: string;
    status: string;
};
