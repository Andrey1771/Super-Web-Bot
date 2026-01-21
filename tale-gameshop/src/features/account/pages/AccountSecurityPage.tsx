import React, {useCallback, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
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
    deleteAccount,
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

const getRelativePasswordLabel = (value?: string | null) => {
    if (!value) {
        return 'over 6 months ago';
    }
    const lastUpdated = new Date(value);
    if (Number.isNaN(lastUpdated.getTime())) {
        return 'recently';
    }
    const diffMs = Date.now() - lastUpdated.getTime();
    const diffMonths = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24 * 30)));
    return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
};

const AccountSecurityPage: React.FC = () => {
    const {keycloak} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);
    const [status, setStatus] = useState<AccountSecurityStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [isChangeEmailOpen, setIsChangeEmailOpen] = useState(false);
    const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
    const [isEnable2faOpen, setIsEnable2faOpen] = useState(false);
    const [isManage2faOpen, setIsManage2faOpen] = useState(false);
    const [twoFactorAction, setTwoFactorAction] = useState<SecurityActionResponse | null>(null);

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
            showToast('Unable to load security settings.');
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    React.useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleResendEmail = async () => {
        setIsSubmitting(true);
        try {
            await resendVerificationEmail();
            showToast('Verification email sent.');
        } catch (error) {
            showToast('Unable to resend verification email.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChangeEmail = async (payload: { newEmail: string; password: string }) => {
        setIsSubmitting(true);
        try {
            await changeEmail(payload);
            showToast('Email updated. Please verify your new address.');
            setIsChangeEmailOpen(false);
            await fetchStatus();
        } catch (error) {
            showToast('Unable to change email.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordChange = async (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
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
            showToast('Unable to update password.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordReset = async () => {
        setIsSubmitting(true);
        try {
            await sendResetPasswordEmail();
            showToast('Password reset email sent.');
        } catch (error) {
            showToast('Unable to send reset email.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSetup2fa = async () => {
        setIsSubmitting(true);
        try {
            const response = await setupTwoFactor();
            setTwoFactorAction(response);
            setIsEnable2faOpen(true);
        } catch (error) {
            showToast('Unable to start 2FA setup.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenManage2fa = () => {
        if (status?.accountConsoleUrl) {
            setIsManage2faOpen(true);
        } else {
            showToast('2FA settings are unavailable right now.');
        }
    };

    const handleLogoutSession = async (sessionId: string) => {
        setIsSubmitting(true);
        try {
            await revokeSession(sessionId);
            showToast('Session revoked.');
            await fetchStatus();
        } catch (error) {
            showToast('Unable to revoke session.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLogoutAll = async () => {
        setIsSubmitting(true);
        try {
            await revokeAllSessions();
            showToast('All sessions revoked.');
            await fetchStatus();
        } catch (error) {
            showToast('Unable to revoke sessions.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDownloadReport = async () => {
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
            showToast('Unable to download security report.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteAccount = async (payload: { confirmation: string; password: string; twoFactorCode?: string }) => {
        setIsSubmitting(true);
        try {
            await deleteAccount(payload);
            showToast('Account deleted.');
            setIsDeleteAccountOpen(false);
            await keycloakAuthService.logoutWithRedirect(keycloak, window.location.origin);
        } catch (error) {
            showToast('Unable to delete account.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const bannerVisible = !status?.twoFactorEnabled || !status?.emailVerified;
    const passwordUpdatedLabel = useMemo(() => getRelativePasswordLabel(status?.passwordUpdatedAt ?? null), [status?.passwordUpdatedAt]);

    return (
        <AccountShell
            title="Security"
            sectionLabel="Security"
            subtitle="Manage password, email verification and 2FA."
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
            <SecurityBanner show={bannerVisible} onSetup2fa={handleSetup2fa} />

            <div className="security-grid">
                <TwoFactorCard
                    isEnabled={Boolean(status?.twoFactorEnabled)}
                    backupCodesGenerated={Boolean(status?.backupCodesGenerated)}
                    isLoading={isLoading}
                    onPrimaryAction={status?.twoFactorEnabled ? handleOpenManage2fa : handleSetup2fa}
                />
                <EmailVerificationCard
                    emailVerified={Boolean(status?.emailVerified)}
                    isLoading={isLoading || isSubmitting}
                    onResend={handleResendEmail}
                    onChangeEmail={() => setIsChangeEmailOpen(true)}
                />
            </div>

            <PasswordCard
                isSubmitting={isSubmitting}
                lastUpdatedLabel={passwordUpdatedLabel}
                onSubmit={handlePasswordChange}
                onReset={handlePasswordReset}
            />

            <div className="security-bottom-grid">
                <ActiveSessionsCard
                    sessions={status?.sessions ?? []}
                    isLoading={isLoading}
                    onLogoutSession={handleLogoutSession}
                    onLogoutAll={handleLogoutAll}
                />
                <DangerZoneCard
                    onDelete={() => setIsDeleteAccountOpen(true)}
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
                isOpen={isDeleteAccountOpen}
                isSubmitting={isSubmitting}
                onClose={() => setIsDeleteAccountOpen(false)}
                onConfirm={handleDeleteAccount}
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
