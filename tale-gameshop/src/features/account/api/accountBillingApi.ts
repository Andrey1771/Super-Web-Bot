import container from '../../../inversify.config';
import IDENTIFIERS from '../../../constants/identifiers';
import type { IApiClient } from '../../../iterfaces/i-api-client';

export type PaymentMethodDto = {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
    label?: string | null;
};

export type BillingSummaryDto = {
    displayName: string;
    email: string;
    paymentMethods: PaymentMethodDto[];
    defaultPaymentMethodId?: string | null;
};

export type InvoiceDto = {
    orderNumber: string;
    invoiceId: string;
    date: string;
    amount: number;
    currency: string;
};

export type PagedResult<T> = {
    items: T[];
    page: number;
    pageSize: number;
    total: number;
};

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export const getBillingSummary = async (): Promise<BillingSummaryDto> => {
    const response = await apiClient().get('/api/account/billing/summary');
    return response.data;
};

export const createSetupIntent = async (): Promise<{ clientSecret: string }> => {
    const response = await apiClient().post('/api/account/billing/setup-intent');
    return response.data;
};

export const listPaymentMethods = async (): Promise<PaymentMethodDto[]> => {
    const response = await apiClient().get('/api/account/billing/payment-methods');
    return response.data;
};

export const makeDefaultPaymentMethod = async (id: string): Promise<void> => {
    await apiClient().post(`/api/account/billing/payment-methods/${id}/make-default`);
};

export const deletePaymentMethod = async (id: string): Promise<void> => {
    await apiClient().delete(`/api/account/billing/payment-methods/${id}`);
};

export const getInvoices = async (page: number, pageSize: number): Promise<PagedResult<InvoiceDto>> => {
    const response = await apiClient().get('/api/account/billing/invoices', {
        params: { page, pageSize }
    });
    return response.data;
};

export const downloadInvoicePdf = async (invoiceId: string): Promise<Blob> => {
    const response = await apiClient().get(`/api/account/billing/invoices/${invoiceId}/pdf`, { responseType: 'blob' });
    return response.data;
};

export const downloadMyData = async (): Promise<Blob> => {
    const response = await apiClient().get('/api/account/data/export', { responseType: 'blob' });
    return response.data;
};
