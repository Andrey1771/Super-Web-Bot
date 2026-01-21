import container from '../../../inversify.config';
import IDENTIFIERS from '../../../constants/identifiers';
import type { IApiClient } from '../../../iterfaces/i-api-client';
import type { CreateSupportTicketPayload, CreateSupportTicketResponse, SupportTicket, SupportTicketListResponse } from './types';

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export const listSupportTickets = async (): Promise<SupportTicket[]> => {
    const response = await apiClient().get<SupportTicketListResponse>('/api/support/tickets');
    return response.data.items ?? [];
};

export const createSupportTicket = async (payload: CreateSupportTicketPayload): Promise<CreateSupportTicketResponse> => {
    const response = await apiClient().post<CreateSupportTicketResponse>('/api/support/tickets', payload);
    return response.data;
};

export const uploadSupportAttachment = async (
    ticketId: string,
    messageId: string,
    files: File[]
): Promise<void> => {
    const formData = new FormData();
    files.forEach((file) => {
        formData.append('files', file);
    });

    await apiClient().post(`/api/support/tickets/${ticketId}/attachments?messageId=${encodeURIComponent(messageId)}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};
