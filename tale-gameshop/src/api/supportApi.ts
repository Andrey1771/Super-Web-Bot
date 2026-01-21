import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type { IApiClient } from '../iterfaces/i-api-client';
import type { AttachmentMeta, AuthorType, SupportMessage, TicketDetails, TicketStatus } from '../types/support';

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

const statusFromApi = (status: string | number): TicketStatus => {
    if (typeof status === 'number') {
        const map: Record<number, TicketStatus> = {
            0: 'Open',
            1: 'WaitingForUser',
            2: 'WaitingForSupport',
            3: 'Resolved',
            4: 'Closed'
        };
        return map[status] ?? 'Open';
    }
    return status as TicketStatus;
};

const authorFromApi = (author: string | number): AuthorType => {
    if (typeof author === 'number') {
        const map: Record<number, AuthorType> = {
            0: 'User',
            1: 'Support',
            2: 'System'
        };
        return map[author] ?? 'User';
    }
    return author as AuthorType;
};

export const getTicketDetails = async (ticketId: string): Promise<TicketDetails> => {
    const response = await apiClient().get(`/api/support/tickets/${ticketId}`);
    const payload = response.data?.ticket ? response.data : { ticket: response.data, messages: response.data?.messages ?? [] };
    const ticket = payload.ticket;
    return {
        ...ticket,
        status: statusFromApi(ticket.status),
        messages: (payload.messages ?? []).map((message: SupportMessage) => ({
            ...message,
            authorType: authorFromApi(message.authorType)
        }))
    } as TicketDetails;
};

export const postTicketMessage = async (ticketId: string, body: string): Promise<SupportMessage> => {
    const response = await apiClient().post(`/api/support/tickets/${ticketId}/messages`, { body });
    return {
        ...response.data,
        authorType: authorFromApi(response.data.authorType)
    } as SupportMessage;
};

export const uploadTicketAttachment = async (
    ticketId: string,
    messageId: string,
    files: File[]
): Promise<AttachmentMeta[]> => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const response = await apiClient().post(
        `/api/support/tickets/${ticketId}/attachments?messageId=${encodeURIComponent(messageId)}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
    );

    return response.data;
};

export const resolveTicket = async (ticketId: string): Promise<void> => {
    await apiClient().post(`/api/support/admin/tickets/${ticketId}/resolve`);
};

export const closeTicket = async (ticketId: string): Promise<void> => {
    await apiClient().post(`/api/support/admin/tickets/${ticketId}/close`);
};

export const downloadTranscript = async (ticketId: string): Promise<Blob> => {
    const response = await apiClient().get(`/api/support/tickets/${ticketId}/transcript`, { responseType: 'blob' });
    return response.data;
};
