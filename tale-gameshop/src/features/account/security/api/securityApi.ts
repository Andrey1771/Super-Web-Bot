import container from '../../../../inversify.config';
import IDENTIFIERS from '../../../../constants/identifiers';
import type { IApiClient } from '../../../../iterfaces/i-api-client';
import type {
    AccountSecurityProfile,
    AccountSession,
    TwoFactorEnableResponse,
    TwoFactorSetup
} from '../types';

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export const getAccountSecurityProfile = async (): Promise<AccountSecurityProfile> => {
    const response = await apiClient().get('/api/account/me');
    return response.data;
};

export const resendVerificationEmail = async (): Promise<void> => {
    await apiClient().post('/api/account/email/resend-verification');
};

export const changeEmail = async (payload: { newEmail: string; password: string }): Promise<void> => {
    await apiClient().post('/api/account/email/change', payload);
};

export const changePassword = async (payload: { currentPassword: string; newPassword: string }): Promise<void> => {
    await apiClient().post('/api/account/password/change', payload);
};

export const fetchTwoFactorSetup = async (): Promise<TwoFactorSetup> => {
    const response = await apiClient().get('/api/account/2fa/setup');
    return response.data;
};

export const enableTwoFactor = async (payload: { code: string; password: string }): Promise<TwoFactorEnableResponse> => {
    const response = await apiClient().post('/api/account/2fa/enable', payload);
    return response.data;
};

export const disableTwoFactor = async (payload: { code: string; password: string }): Promise<void> => {
    await apiClient().post('/api/account/2fa/disable', payload);
};

export const regenerateBackupCodes = async (payload: { code: string; password: string }): Promise<TwoFactorEnableResponse> => {
    const response = await apiClient().post('/api/account/2fa/backup/regenerate', payload);
    return response.data;
};

export const getActiveSessions = async (): Promise<AccountSession[]> => {
    const response = await apiClient().get('/api/account/sessions');
    return response.data;
};

export const revokeSession = async (sessionId: string): Promise<void> => {
    await apiClient().post(`/api/account/sessions/${sessionId}/revoke`);
};

export const revokeAllSessions = async (): Promise<void> => {
    await apiClient().post('/api/account/sessions/revoke-all');
};

export const downloadSecurityReport = async (): Promise<Blob> => {
    const response = await apiClient().get('/api/account/security-report', { responseType: 'blob' });
    return response.data;
};

export const deleteAccount = async (payload: { confirmation: string; password: string; twoFactorCode?: string }): Promise<void> => {
    await apiClient().post('/api/account/delete', payload);
};
