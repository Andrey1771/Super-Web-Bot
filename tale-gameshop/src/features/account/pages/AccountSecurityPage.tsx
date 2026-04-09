import React, {useCallback, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {AxiosError} from 'axios';
import AccountShell from '../components/AccountShell';
import SecurityBanner from '../security/components/SecurityBanner';
import TwoFactorCard from '../security/components/TwoFactorCard';
import EmailVerificationCard from '../security/components/EmailVerificationCard';
import PasswordCard from '../security/components/PasswordCard';
import ActiveSessionsCard from '../security/components/ActiveSessionsCard';
import DangerZoneCard from '../security/components/DangerZoneCard';
import RecommendationsRow from '../security/components/RecommendationsRow';
import ChangeEmailModal from '../security/modals/ChangeEmailModal';
import DeleteAccountModal from '../security/modals/DeleteAccountModal';
import Enable2FAModal from '../security/modals/Enable2FAModal';
import Manage2FAModal from '../security/modals/Manage2FAModal';
import {
    changeEmail,
    changePassword,
    deactivateAccount,
    downloadSecurityReport,
    getAccountSecurityStatus,
    resendVerificationEmail,
    revokeAllSessions,
    revokeSession,
    sendResetPasswordEmail,
    setupTwoFactor
} from '../security/api/securityApi';
import type {AccountSecurityStatus, SecurityActionResponse} from '../security/types';
import {useKeycloak} from '@react-keycloak/web';
import type {IKeycloakAuthService} from '../../../iterfaces/i-keycloak-auth-service';
import container from '../../../inversify.config';
import IDENTIFIERS from '../../../constants/identifiers';
import './account-security-page.css';

const getPasswordInfoLabel = (value?: string | null) => {
    if (!value) {
        return 'Last password change date unavailable. Password changes are managed via Keycloak policies.';
    }

    const lastUpdated = new Date(value);
    if (Number.isNaN(lastUpdated.getTime())) {
        return 'Last password change date unavailable.';
    }

    return `Last password change: ${lastUpdated.toLocaleDateString()}.`;
};

const getErrorMessage = (error: unknown, fallbackMessage: string) => {
    if (error instanceof AxiosError) {
        const message = error.response?.data?.message || error.response?.data?.detail;
        if (typeof message === 'string' && message.trim().length > 0) {
            return message;
        }

        if (error.response?.status === 401) {
            return 'Your session has expired. Please sign in again.';
        }

        if (error.response?.status === 503) {
            return 'Security integration is unavailable. Please contact support.';
        }
    }

    return fallbackMessage;
};

const AccountSecurityPage: React.FC = () => {
    const {keycloak} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);
    const [status, setStatus] = useState<AccountSecurityStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [isChangeEmailOpen, setIsChangeEmailOpen] = useState(false);
    const [isDeactivateAccountOpen, setIsDeactivateAccountOpen] = useState(false);
    const [isEnable2faOpen, setIsEnable2faOpen] = useState(false);
    const [isManage2faOpen, setIsManage2faOpen] = useState(false);
    const [twoFactorAction, setTwoFactorAction] = useState<SecurityActionResponse | null>(null);
    const readOnlyHint = 'Unavailable in current environment.';

    const showToast = useCallback((message: string) => {
        setToast(message);
        window.setTimeout(() => setToast(null), 4000);
    }, []);

    const fetchStatus = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getAccountSecurityStatus();
            setStatus(data);
        } catch (error) {
            showToast(getErrorMessage(error, 'Unable to load security settings.'));
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    React.useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleResendEmail = async () => {
        if (!status?.capabilities?.canResendVerificationEmail) {
            showToast(readOnlyHint);
            return;
        }
        setIsSubmitting(true);
        try {
            await resendVerificationEmail();
            showToast('Verification email sent.');
        } catch (error) {
            showToast(getErrorMessage(error, 'Unable to resend verification email.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChangeEmail = async (payload: { newEmail: string; password: string }) => {
        if (!status?.capabilities?.canChangeEmail) {
            showToast(readOnlyHint);
            return;
        }
        setIsSubmitting(true);
        try {
            const response = await changeEmail(payload);
            showToast(response.message || 'Email updated. Please verify your new address.');
            setIsChangeEmailOpen(false);
            await fetchStatus();
        } catch (error) {
            showToast(getErrorMessage(error, 'Unable to change email.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordChange = async (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
        if (!status?.capabilities?.canChangePasswordInline) {
            showToast(readOnlyHint);
            return;
        }
        setIsSubmitting(true);
        try {
            const response = await changePassword({
                currentPassword: payload.currentPassword,
                newPassword: payload.newPassword
            });
            showToast(response.message || 'Password updated.');
            if (response.mode === 'logout') {
                await keycloakAuthService.logoutWithRedirect(keycloak, window.location.origin);
            } else {
                await fetchStatus();
            }
        } catch (error) {
            showToast(getErrorMessage(error, 'Unable to update password.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!status?.capabilities?.canSendPasswordResetEmail) {
            showToast(readOnlyHint);
            return;
        }
        setIsSubmitting(true);
        try {
            const response = await sendResetPasswordEmail();
            showToast(response.message || 'Password reset email sent.');
        } catch (error) {
            showToast(getErrorMessage(error, 'Unable to send reset email.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSetup2fa = async () => {
        if (!status?.capabilities?.canManageTwoFactor) {
            showToast(readOnlyHint);
            return;
        }
        setIsSubmitting(true);
        try {
            const response = await setupTwoFactor();
            setTwoFactorAction(response);
            setIsEnable2faOpen(true);
        } catch (error) {
            showToast(getErrorMessage(error, 'Unable to start 2FA setup.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenManage2fa = () => {
        if (status?.accountConsoleUrl) {
            setIsManage2faOpen(true);
        } else {
            showToast(status?.unavailableReasons?.configuration || '2FA settings are unavailable right now.');
        }
    };

    const handleLogoutSession = async (sessionId: string) => {
        if (!status?.capabilities?.canManageSessions) {
            showToast(readOnlyHint);
            return;
        }
        setIsSubmitting(true);
        try {
            await revokeSession(sessionId);
            showToast('Session revoked.');
            await fetchStatus();
        } catch (error) {
            showToast(getErrorMessage(error, 'Unable to revoke session.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLogoutAll = async () => {
        if (!status?.capabilities?.canManageSessions) {
            showToast(readOnlyHint);
            return;
        }
        setIsSubmitting(true);
        try {
            await revokeAllSessions();
            showToast('All sessions revoked.');
            await fetchStatus();
        } catch (error) {
            showToast(getErrorMessage(error, 'Unable to revoke sessions.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDownloadReport = async () => {
        if (!status?.capabilities?.canDownloadSecurityReport) {
            showToast(readOnlyHint);
            return;
        }
        setIsSubmitting(true);
        try {
            const blob = await downloadSecurityReport();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'security-report.json';
            link.click();
            window.URL.revokeObjectURL(url);
            showToast('Security report downloaded.');
        } catch (error) {
            showToast(getErrorMessage(error, 'Unable to download security report.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeactivateAccount = async (payload: { confirmation: string; password: string }) => {
        if (!status?.capabilities?.canDeactivateAccount) {
            showToast(readOnlyHint);
            return;
        }
        setIsSubmitting(true);
        try {
            const response = await deactivateAccount(payload);
            showToast(response.message || 'Account deactivated.');
            setIsDeactivateAccountOpen(false);
            await keycloakAuthService.logoutWithRedirect(keycloak, window.location.origin);
        } catch (error) {
            showToast(getErrorMessage(error, 'Unable to deactivate account.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const bannerVisible = Boolean(status?.keycloakAdminConfigured) && (!status?.twoFactorEnabled || !status?.emailVerified);
    const passwordUpdatedLabel = useMemo(() => getPasswordInfoLabel(status?.passwordUpdatedAt ?? null), [status?.passwordUpdatedAt]);
    const unavailableConfigurationReason = status?.unavailableReasons?.configuration;
    const isReadOnly = status?.keycloakAdminConfigured === false;

    return (
        <AccountShell
            title="Security"
            sectionLabel="Security"
            subtitle="Manage account security settings powered by Keycloak."
            actions={(
                <>
                    <Link to="/account/settings" className="btn btn-outline account-action-btn">
                        Edit profile
                    </Link>
                    <Link to="/support" className="btn btn-primary account-action-btn">
                        Support
                    </Link>
                </>
            )}
            headerTestId="security-header"
        >
            {isReadOnly && (
                <div className="security-unavailable-banner">
                    <h3>Read-only security status</h3>
                    <p>Keycloak Admin security integration is not configured. Some actions are unavailable in this environment.</p>
                    <p className="security-unavailable-hint">{unavailableConfigurationReason}</p>
                </div>
            )}
            <SecurityBanner show={bannerVisible} onSetup2fa={handleSetup2fa} />

            <div className="security-grid">
                <TwoFactorCard
                    isEnabled={Boolean(status?.twoFactorEnabled)}
                    backupCodesGenerated={status?.backupCodesGenerated}
                    canManage={Boolean(status?.capabilities?.canManageTwoFactor)}
                    readOnlyHint={!status?.capabilities?.canManageTwoFactor ? readOnlyHint : undefined}
                    isLoading={isLoading}
                    onPrimaryAction={status?.twoFactorEnabled ? handleOpenManage2fa : handleSetup2fa}
                />
                <EmailVerificationCard
                    emailVerified={Boolean(status?.emailVerified)}
                    isLoading={isLoading || isSubmitting}
                    canResendVerification={Boolean(status?.capabilities?.canResendVerificationEmail)}
                    canChangeEmail={Boolean(status?.capabilities?.canChangeEmail)}
                    readOnlyHint={isReadOnly ? readOnlyHint : undefined}
                    onResend={handleResendEmail}
                    onChangeEmail={() => setIsChangeEmailOpen(true)}
                />
            </div>

            <PasswordCard
                isSubmitting={isSubmitting}
                lastUpdatedLabel={passwordUpdatedLabel}
                canChangeInline={Boolean(status?.capabilities?.canChangePasswordInline)}
                canSendResetEmail={Boolean(status?.capabilities?.canSendPasswordResetEmail)}
                readOnlyHint={!status?.capabilities?.canChangePasswordInline ? readOnlyHint : undefined}
                onSubmit={handlePasswordChange}
                onReset={handlePasswordReset}
            />

            <div className="security-bottom-grid">
                <ActiveSessionsCard
                    sessions={status?.sessions ?? []}
                    isLoading={isLoading}
                    canManageSessions={Boolean(status?.capabilities?.canManageSessions)}
                    readOnlyHint={!status?.capabilities?.canManageSessions ? readOnlyHint : undefined}
                    onLogoutSession={handleLogoutSession}
                    onLogoutAll={handleLogoutAll}
                />
                <DangerZoneCard
                    canDeactivate={Boolean(status?.capabilities?.canDeactivateAccount)}
                    canDownloadReport={Boolean(status?.capabilities?.canDownloadSecurityReport)}
                    readOnlyHint={isReadOnly ? readOnlyHint : undefined}
                    onDeactivate={() => setIsDeactivateAccountOpen(true)}
                    onDownloadReport={handleDownloadReport}
                />
            </div>

            <RecommendationsRow />

            <ChangeEmailModal
                isOpen={isChangeEmailOpen}
                isSubmitting={isSubmitting}
                onClose={() => setIsChangeEmailOpen(false)}
                onSubmit={handleChangeEmail}
            />
            <DeleteAccountModal
                isOpen={isDeactivateAccountOpen}
                isSubmitting={isSubmitting}
                onClose={() => setIsDeactivateAccountOpen(false)}
                onConfirm={handleDeactivateAccount}
            />
            <Enable2FAModal
                isOpen={isEnable2faOpen}
                isSubmitting={isSubmitting}
                action={twoFactorAction}
                onClose={() => setIsEnable2faOpen(false)}
                onRefresh={fetchStatus}
            />
            <Manage2FAModal
                isOpen={isManage2faOpen}
                isSubmitting={isSubmitting}
                accountConsoleUrl={status?.accountConsoleUrl ?? ''}
                onClose={() => setIsManage2faOpen(false)}
            />
            {toast && <div className="security-toast">{toast}</div>}
        </AccountShell>
    );
};

export default AccountSecurityPage;
