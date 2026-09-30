import { apiClient } from './client';

// Публичная часть восстановления доступа: подача заявки работает без логина
// (интерцептор добавляет токен только когда он есть), отмена — по токену из письма.

export type RecoveryRequestPayload = {
    accountEmail: string;
    contactEmail?: string;
    orderNumbers?: string;
    cardLast4?: string;
    message?: string;
};

export type PendingRecovery = {
    exists: boolean;
    publicId?: string | null;
    status?: string | null;
    createdAt?: string | null;
    executeAfter?: string | null;
};

export const submitRecoveryRequest = async (payload: RecoveryRequestPayload): Promise<void> => {
    await apiClient().post('/api/account-recovery/requests', payload);
};

export const cancelRecoveryByToken = async (token: string): Promise<boolean> => {
    const response = await apiClient().post('/api/account-recovery/cancel-by-token', { token });
    return Boolean(response.data?.cancelled);
};

export const getPendingRecovery = async (): Promise<PendingRecovery> => {
    const response = await apiClient().get('/api/account-recovery/pending');
    return response.data;
};

export const cancelPendingRecovery = async (): Promise<boolean> => {
    const response = await apiClient().post('/api/account-recovery/pending/cancel');
    return Boolean(response.data?.cancelled);
};
