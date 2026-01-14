import container from '../../../inversify.config';
import type {IApiClient} from '../../../iterfaces/i-api-client';
import IDENTIFIERS from '../../../constants/identifiers';
import type {AccountOrdersResponse} from '../types';

export type AccountOrdersQuery = {
    q?: string;
    status?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
};

export const fetchAccountOrders = async (
    query: AccountOrdersQuery,
    signal?: AbortSignal
): Promise<AccountOrdersResponse> => {
    const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    const response = await apiClient.api.get<AccountOrdersResponse>('/api/account/orders', {
        params: query,
        signal
    });
    return response.data;
};

export const fetchOrderInvoice = async (orderId: string): Promise<Blob> => {
    const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    const response = await apiClient.api.get(`/api/account/orders/${orderId}/invoice`, {
        responseType: 'blob'
    });
    return response.data;
};
