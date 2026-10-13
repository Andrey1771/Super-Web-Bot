export type TicketStatus = 'Open' | 'WaitingForUser' | 'WaitingForSupport' | 'Resolved' | 'Closed';
export type AuthorType = 'User' | 'Support' | 'System';

export interface AttachmentMeta {
    id: string;
    fileName: string;
    sizeBytes: number;
    contentType: string;
}

export interface SupportMessage {
    id: string;
    ticketId: string;
    authorType: AuthorType;
    authorName: string;
    body: string;
    createdAt: string;
    attachments?: AttachmentMeta[];
}

export interface TicketSummary {
    id: string;
    publicId?: string | number;
    subject: string;
    category: string;
    status: TicketStatus | string | number;
    updatedAt: string;
}

export interface TicketDetails {
    id: string;
    publicId: string | number;
    subject: string;
    category: string;
    status: TicketStatus;
    priority?: 'Normal' | 'High';
    order?: { id: string; number?: string; gameTitle?: string };
    email: string;
    assignedTo?: string;
    createdAt: string;
    updatedAt: string;
    messages: SupportMessage[];
}
