import container from '../../../inversify.config';
import IDENTIFIERS from '../../../constants/identifiers';
import type { IApiClient } from '../../../iterfaces/i-api-client';
import type { CreateSupportTicketPayload, SupportTicket } from './types';

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export const listSupportTickets = async (): Promise<SupportTicket[]> => {
    const response = await apiClient().get<SupportTicket[]>('/api/support/tickets');
    return response.data;
};

export const createSupportTicket = async (payload: CreateSupportTicketPayload): Promise<SupportTicket> => {
    const response = await apiClient().post<SupportTicket>('/api/support/tickets', payload);
    return response.data;
};

export const uploadSupportAttachment = async (ticketId: string, file: File): Promise<void> => {
    const formData = new FormData();
    formData.append('file', file);

    await apiClient().post(`/api/support/tickets/${ticketId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};
