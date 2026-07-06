import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type { IApiClient } from '../iterfaces/i-api-client';

// Админский workflow восстановления доступа (/api/account-recovery/admin).
// Доступ — политика SupportAgent (роли admin/support), как у тикетов.

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export type RecoveryStatus = 'Pending' | 'Approved' | 'Executed' | 'Rejected' | 'Cancelled';

export type RecoverySummary = {
    id: string;
    publicId: string;
    accountEmail: string;
    status: RecoveryStatus;
    accountFound: boolean;
    createdAt: string;
    updatedAt: string;
    executeAfter?: string | null;
};

export type RecoveryChecklistItem = {
    key: string;
    label: string;
    passed: boolean | null;
};

export type RecoveryAuditEntry = {
    at: string;
    actor: string;
    action: string;
    details?: string | null;
};

export type RecoveryAccountSnapshot = {
    found: boolean;
    userId?: string | null;
    username?: string | null;
    email?: string | null;
    emailVerified: boolean;
    enabled: boolean;
    accountCreatedAt?: string | null;
    twoFactorEnabled: boolean;
    backupCodesGenerated: boolean;
    backupCodesRemaining?: number | null;
    activeSessions: { ipAddress: string; start: string; lastAccess: string }[];
    loginEvents: { time: string; type: string; ipAddress?: string | null; clientId?: string | null }[];
    recentOrders: {
        orderNumber?: string | null;
        gameName: string;
        totalAmount?: number | null;
        currency?: string | null;
        isPaid: boolean;
        createdAt: string;
    }[];
    loginEventsError?: string | null;
};

export type RecoveryDetail = {
    id: string;
    publicId: string;
    status: RecoveryStatus;
    accountEmail: string;
    contactEmail: string;
    claimedOrderNumbers: string;
    claimedCardLast4: string;
    message: string;
    requestIp: string;
    requestUserAgent: string;
    createdAt: string;
    updatedAt: string;
    approvedAt?: string | null;
    approvedBy?: string | null;
    executeAfter?: string | null;
    executedAt?: string | null;
    executedBy?: string | null;
    rejectedAt?: string | null;
    rejectedBy?: string | null;
    rejectReason?: string | null;
    cancelledAt?: string | null;
    cancelSource?: string | null;
    checklist: RecoveryChecklistItem[];
    auditLog: RecoveryAuditEntry[];
    account: RecoveryAccountSnapshot;
};

export const listRecoveryRequests = async (status?: string): Promise<RecoverySummary[]> => {
    const response = await apiClient().get('/api/account-recovery/admin/requests', {
        params: status ? { status } : undefined
    });
    return response.data;
};

export const getRecoveryDetail = async (id: string): Promise<RecoveryDetail> => {
    const response = await apiClient().get(`/api/account-recovery/admin/requests/${id}`);
    return response.data;
};

export const updateRecoveryChecklist = async (id: string, items: { key: string; passed: boolean | null }[]): Promise<RecoveryDetail> => {
    const response = await apiClient().post(`/api/account-recovery/admin/requests/${id}/checklist`, { items });
    return response.data;
};

export const approveRecovery = async (id: string): Promise<RecoveryDetail> => {
    const response = await apiClient().post(`/api/account-recovery/admin/requests/${id}/approve`);
    return response.data;
};

export const rejectRecovery = async (id: string, reason?: string): Promise<RecoveryDetail> => {
    const response = await apiClient().post(`/api/account-recovery/admin/requests/${id}/reject`, { reason });
    return response.data;
};

export const executeRecovery = async (id: string): Promise<RecoveryDetail> => {
    const response = await apiClient().post(`/api/account-recovery/admin/requests/${id}/execute`);
    return response.data;
};
