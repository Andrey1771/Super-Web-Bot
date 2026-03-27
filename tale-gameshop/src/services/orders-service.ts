import { injectable } from 'inversify';
import IDENTIFIERS from '../constants/identifiers';
import container from '../inversify.config';
import type { IApiClient } from '../iterfaces/i-api-client';
import type { IOrdersService } from '../iterfaces/i-orders-service';
import type { Order } from '../models/order';

const API_URL = '/api/order/summary';

@injectable()
export class OrdersService implements IOrdersService {
    private readonly _apiClient: IApiClient;

    constructor() {
        this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    }

    async getOrders(): Promise<Order[]> {
        const response = await this._apiClient.api.get(API_URL);
        return response.data;
    }
}
