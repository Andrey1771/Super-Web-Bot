import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type { IApiClient } from '../iterfaces/i-api-client';
import type { AuthorType, SupportMessage, TicketStatus } from '../types/support';

// Канал поддержки для агентов (/api/support/admin): всё, что отправлено отсюда, авторится как Support.
// Доступ — политика SupportAgent (роли admin/support).

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

export type AdminTicketSummary = {
    id: string;
    publicId: string;
    subject: string;
    category: string;
    status: TicketStatus;
    updatedAt: string;
    lastMessageAt: string;
    userEmail: string;
};

export type AdminTicketList = {
    items: AdminTicketSummary[];
    page: number;
    pageSize: number;
    total: number;
};

export type AdminTicketDetails = {
    ticket: AdminTicketSummary;
    messages: SupportMessage[];
};

const mapSummary = (raw: any): AdminTicketSummary => ({
    id: raw.id,
    publicId: raw.publicId ?? '',
    subject: raw.subject ?? '',
    category: raw.category ?? '',
    status: statusFromApi(raw.status),
    updatedAt: raw.updatedAt,
    lastMessageAt: raw.lastMessageAt,
    userEmail: raw.userEmail ?? ''
});

export const listAdminTickets = async (params: {
    status?: string;
    q?: string;
    page?: number;
    pageSize?: number;
}): Promise<AdminTicketList> => {
    const response = await apiClient().get('/api/support/admin/tickets', {
        params: {
            status: params.status || undefined,
            q: params.q || undefined,
            page: params.page ?? 1,
            pageSize: params.pageSize ?? 20
        }
    });
    return {
        items: (response.data.items ?? []).map(mapSummary),
        page: response.data.page ?? 1,
        pageSize: response.data.pageSize ?? 20,
        total: response.data.total ?? 0
    };
};

export const getAdminTicketDetails = async (ticketId: string): Promise<AdminTicketDetails> => {
    const response = await apiClient().get(`/api/support/admin/tickets/${ticketId}`);
    return {
        ticket: mapSummary(response.data.ticket),
        messages: (response.data.messages ?? []).map((message: SupportMessage) => ({
            ...message,
            authorType: authorFromApi(message.authorType)
        }))
    };
};

export const postAdminTicketMessage = async (ticketId: string, body: string): Promise<SupportMessage> => {
    const response = await apiClient().post(`/api/support/admin/tickets/${ticketId}/messages`, { body });
    return { ...response.data, authorType: authorFromApi(response.data.authorType) };
};

export const resolveAdminTicket = async (ticketId: string): Promise<void> => {
    await apiClient().post(`/api/support/admin/tickets/${ticketId}/resolve`);
};

export const closeAdminTicket = async (ticketId: string): Promise<void> => {
    await apiClient().post(`/api/support/admin/tickets/${ticketId}/close`);
};

export const uploadAdminAttachments = async (
    ticketId: string,
    messageId: string,
    files: File[]
): Promise<void> => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    await apiClient().post(
        `/api/support/admin/tickets/${ticketId}/attachments?messageId=${encodeURIComponent(messageId)}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
    );
};

export const downloadAdminAttachment = async (attachmentId: string): Promise<Blob> => {
    const response = await apiClient().get(`/api/support/admin/attachments/${attachmentId}/download`, {
        responseType: 'blob'
    });
    return response.data;
};
