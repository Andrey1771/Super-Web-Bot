import type {AccountOverview} from "../types";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type {IApiClient} from "../../../iterfaces/i-api-client";

const API_BASE = "/api/account";

const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);

export const getAccountOverview = async (): Promise<AccountOverview> => {
    const response = await apiClient.api.get(`${API_BASE}/overview`);
    return response.data;
};

export const downloadInvoice = async (orderId: string): Promise<Blob> => {
    const response = await apiClient.api.get(`${API_BASE}/orders/${orderId}/invoice`, {
        responseType: "blob",
    });
    return response.data;
};
