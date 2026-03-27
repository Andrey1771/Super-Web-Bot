import container from '../inversify.config';
import type { IApiClient } from '../iterfaces/i-api-client';
import IDENTIFIERS from '../constants/identifiers';

export interface PaymentMethodDto {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
    label?: string | null;
}

export interface BillingDetailsDto {
    addressLine1?: string | null;
    city?: string | null;
    postalCode?: string | null;
    country?: string | null;
    phone?: string | null;
}

export interface BillingProfileDto {
    displayName: string;
    email: string;
    billingDetails?: BillingDetailsDto | null;
    hideOwnedGamesInProfile: boolean;
}

export interface InvoiceDto {
    id: string;
    orderId: string;
    date: string;
    amount: number;
    currency: string;
    pdfAvailable: boolean;
}

export interface InvoicePageDto {
    items: InvoiceDto[];
    totalCount: number;
    page: number;
    pageSize: number;
}

export interface SetupIntentResponse {
    clientSecret: string;
}

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export const fetchBillingProfile = async (): Promise<BillingProfileDto> => {
    const response = await apiClient().get<BillingProfileDto>('/api/billing/profile');
    return response.data;
};

export const updateBillingProfile = async (payload: Partial<BillingProfileDto>): Promise<BillingProfileDto> => {
    const response = await apiClient().put<BillingProfileDto>('/api/billing/profile', payload);
    return response.data;
};

export const fetchPaymentMethods = async (): Promise<PaymentMethodDto[]> => {
    const response = await apiClient().get<PaymentMethodDto[]>('/api/billing/payment-methods');
    return response.data;
};

export const createSetupIntent = async (): Promise<SetupIntentResponse> => {
    const response = await apiClient().post<SetupIntentResponse>('/api/billing/payment-methods/setup-intent');
    return response.data;
};

export const setDefaultPaymentMethod = async (paymentMethodId: string): Promise<void> => {
    await apiClient().post('/api/billing/payment-methods/set-default', { paymentMethodId });
};

export const removePaymentMethod = async (paymentMethodId: string): Promise<void> => {
    await apiClient().delete(`/api/billing/payment-methods/${paymentMethodId}`);
};

export const fetchInvoices = async (page: number, pageSize: number): Promise<InvoicePageDto> => {
    const response = await apiClient().get<InvoicePageDto>('/api/billing/invoices', {
        params: { page, pageSize }
    });
    return response.data;
};

export const downloadInvoicePdf = async (invoiceId: string): Promise<Blob> => {
    const response = await apiClient().get(`/api/billing/invoices/${invoiceId}/pdf`, {
        responseType: 'blob'
    });
    return response.data;
};

export const downloadDataExport = async (): Promise<Blob> => {
    const response = await apiClient().get('/api/account/data-export', {
        responseType: 'blob'
    });
    return response.data;
};
