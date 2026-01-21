export type SupportTicketStatus = string | number;

export interface SupportTicket {
    id: string;
    publicId?: string | number;
    category: string;
    subject: string;
    status: SupportTicketStatus;
    updatedAt: string;
}

export interface SupportAttachment {
    id?: string;
    fileName: string;
    size: number;
    url?: string;
}

export interface CreateSupportTicketPayload {
    category: string;
    subject: string;
    description: string;
}

export interface SupportTicketListResponse {
    items: SupportTicket[];
    page: number;
    pageSize: number;
    total: number;
}

export interface CreateSupportTicketResponse {
    ticket: SupportTicket;
    firstMessageId: string;
}
