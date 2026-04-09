import React from 'react';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {AxiosError} from 'axios';
import AccountSecurityPage from './AccountSecurityPage';
import * as securityApi from '../security/api/securityApi';

jest.mock('@react-keycloak/web', () => ({
    useKeycloak: () => ({
        keycloak: {}
    })
}));

jest.mock('../../../inversify.config', () => ({
    __esModule: true,
    default: {
        get: () => ({
            logoutWithRedirect: jest.fn().mockResolvedValue(undefined)
        })
    }
}));

const statusFixture = {
    email: 'user@mail.com',
    emailVerified: true,
    twoFactorEnabled: false,
    backupCodesGenerated: null,
    passwordUpdatedAt: null,
    keycloakAdminConfigured: true,
    accountConsoleUrl: 'https://keycloak.local/account',
    capabilities: {
        canManageTwoFactor: true,
        canChangePasswordInline: true,
        canSendPasswordResetEmail: true,
        canManageSessions: true,
        canChangeEmail: true,
        canResendVerificationEmail: true,
        canDownloadSecurityReport: true,
        canDeactivateAccount: true
    },
    unavailableReasons: {
        backupCodes: 'Backup codes are managed in Keycloak account console.',
        passwordUpdatedAt: 'Last password change date is not available from Keycloak.'
    },
    sessions: []
};

describe('AccountSecurityPage', () => {
    beforeEach(() => {
        jest.spyOn(securityApi, 'getAccountSecurityStatus').mockResolvedValue(statusFixture as any);
        jest.spyOn(securityApi, 'resendVerificationEmail').mockResolvedValue();
        jest.spyOn(securityApi, 'changeEmail').mockResolvedValue({mode: 'email', message: 'ok'} as any);
        jest.spyOn(securityApi, 'changePassword').mockResolvedValue({mode: 'none', message: 'ok'});
        jest.spyOn(securityApi, 'setupTwoFactor').mockResolvedValue({mode: 'email', message: 'ok'});
        jest.spyOn(securityApi, 'sendResetPasswordEmail').mockResolvedValue({mode: 'email', message: 'ok'} as any);
        jest.spyOn(securityApi, 'revokeSession').mockResolvedValue();
        jest.spyOn(securityApi, 'revokeAllSessions').mockResolvedValue();
        jest.spyOn(securityApi, 'downloadSecurityReport').mockResolvedValue(new Blob());
        jest.spyOn(securityApi, 'deactivateAccount').mockResolvedValue({mode: 'logout', message: 'ok'});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('shows honest copy when password date and backup code status are unavailable', async () => {
        render(
            <MemoryRouter>
                <AccountSecurityPage />
            </MemoryRouter>
        );

        await waitFor(() => expect(securityApi.getAccountSecurityStatus).toHaveBeenCalled());

        expect(screen.getByText('Backup code status is managed in Keycloak.')).toBeInTheDocument();
        expect(screen.getByText(/Last password change date unavailable/i)).toBeInTheDocument();
    });

    it('shows unavailable reason and disables actions when keycloak admin is not configured', async () => {
        (securityApi.getAccountSecurityStatus as jest.Mock).mockResolvedValueOnce({
            ...statusFixture,
            keycloakAdminConfigured: false,
            capabilities: {
                ...statusFixture.capabilities,
                canManageTwoFactor: false,
                canResendVerificationEmail: false,
                canDownloadSecurityReport: false,
                canDeactivateAccount: false
            },
            unavailableReasons: {
                ...statusFixture.unavailableReasons,
                configuration: 'Keycloak admin integration is not configured.'
            }
        });

        render(
            <MemoryRouter>
                <AccountSecurityPage />
            </MemoryRouter>
        );

        expect(await screen.findByText('Keycloak admin integration is not configured.')).toBeInTheDocument();
        expect(screen.getAllByText('Keycloak admin integration is not configured.')).toHaveLength(1);
        expect(screen.getByRole('button', {name: 'Enable 2FA'})).toBeDisabled();
        expect(screen.getByRole('button', {name: 'Deactivate account'})).toBeDisabled();
    });

    it('shows backend message instead of generic error', async () => {
        (securityApi.setupTwoFactor as jest.Mock).mockRejectedValueOnce(
            new AxiosError('failed', undefined, undefined, undefined, {
                status: 400,
                statusText: 'Bad Request',
                headers: {},
                config: {} as any,
                data: {message: '2FA setup is temporarily unavailable'}
            })
        );

        render(
            <MemoryRouter>
                <AccountSecurityPage />
            </MemoryRouter>
        );

        await waitFor(() => expect(securityApi.getAccountSecurityStatus).toHaveBeenCalled());

        await userEvent.click(screen.getByRole('button', {name: 'Enable 2FA'}));

        expect(await screen.findByText('2FA setup is temporarily unavailable')).toBeInTheDocument();
    });
});
