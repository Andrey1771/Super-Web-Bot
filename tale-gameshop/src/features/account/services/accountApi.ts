import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type {IApiClient} from "../../../iterfaces/i-api-client";
import type {AccountOverviewResponse} from "../types";

const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);

export const getAccountOverview = async (): Promise<AccountOverviewResponse> => {
    const response = await apiClient.api.get<AccountOverviewResponse>("/api/account/overview");
    return response.data;
};

export const downloadOrderInvoice = async (orderId: string): Promise<Blob> => {
    const response = await apiClient.api.get(`/api/account/orders/${orderId}/invoice`, {
        responseType: "blob"
    });
    return response.data;
};
