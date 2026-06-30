import container from '../../../../inversify.config';
import IDENTIFIERS from '../../../../constants/identifiers';
import type { IApiClient } from '../../../../iterfaces/i-api-client';
import type {AccountSecurityStatus, SecurityActionResponse} from '../types';

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export const getAccountSecurityStatus = async (): Promise<AccountSecurityStatus> => {
    const response = await apiClient().get('/api/account/security/status');
    return response.data;
};

export const resendVerificationEmail = async (): Promise<void> => {
    await apiClient().post('/api/account/security/email/resend');
};

export const changeEmail = async (payload: { newEmail: string; password: string }): Promise<void> => {
    await apiClient().post('/api/account/security/email/change', payload);
};

export const changePassword = async (payload: { currentPassword: string; newPassword: string }): Promise<SecurityActionResponse> => {
    const response = await apiClient().post('/api/account/security/password/change', payload);
    return response.data;
};

export const setupTwoFactor = async (): Promise<SecurityActionResponse> => {
    const response = await apiClient().post('/api/account/security/2fa/setup');
    return response.data;
};

export const disableTwoFactor = async (): Promise<void> => {
    await apiClient().post('/api/account/security/2fa/disable');
};

export const sendResetPasswordEmail = async (): Promise<void> => {
    await apiClient().post('/api/account/security/password/reset-email');
};

export const revokeSession = async (sessionId: string): Promise<void> => {
    await apiClient().delete(`/api/account/security/sessions/${sessionId}`);
};

export const revokeAllSessions = async (): Promise<void> => {
    await apiClient().post('/api/account/security/sessions/logout-all');
};

export const downloadSecurityReport = async (): Promise<Blob> => {
    const response = await apiClient().post('/api/account/security/report', undefined, { responseType: 'blob' });
    return response.data;
};

export const deleteAccount = async (payload: { confirmation: string; password: string; twoFactorCode?: string }): Promise<void> => {
    await apiClient().post('/api/account/security/delete-account', payload);
};
