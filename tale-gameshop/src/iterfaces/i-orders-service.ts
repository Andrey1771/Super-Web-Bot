import type { Order } from '../models/order';

export interface IOrdersService {
    getOrders(): Promise<Order[]>;
}
