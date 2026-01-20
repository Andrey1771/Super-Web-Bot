import React, {useCallback, useEffect, useMemo, useState} from 'react';
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
import type {AccountSecurityStatus} from '../security/types';
import './account-security-page.css';

const AccountSecurityPage: React.FC = () => {
    const [status, setStatus] = useState<AccountSecurityStatus | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const showToast = useCallback((message: string) => {
        setToast(message);
        setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchStatus = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getAccountSecurityStatus();
            setStatus(data);
        } catch (error) {
            showToast('Unable to load account profile.');
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const requiresBanner = useMemo(() => {
        if (!status) {
            return false;
        }
        return !status.emailVerified || !status.twoFactorEnabled;
    }, [status]);

    const backupGenerated = useMemo(() => Boolean(status?.backupCodesGenerated), [status]);

    const passwordUpdatedLabel = useMemo(() => {
        if (!status?.passwordUpdatedAt) {
            return 'over 6 months ago';
        }
        const last = new Date(status.passwordUpdatedAt).getTime();
        const diffMonths = Math.max(1, Math.floor((Date.now() - last) / (1000 * 60 * 60 * 24 * 30)));
        return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
    }, [status]);

    const handleSetup2fa = async () => {
        setIsActionLoading(true);
        try {
            const response = await setupTwoFactor();
            showToast(response.message || 'Check your email to finish setting up 2FA.');
            if (response.redirectUrl) {
                window.open(response.redirectUrl, '_blank');
            }
        } catch (error) {
            showToast('Unable to prepare 2FA setup.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleManage2fa = () => {
        if (status?.accountConsoleUrl) {
            window.open(status.accountConsoleUrl, '_blank');
            return;
        }
        handleSetup2fa();
    };

    const handleResendEmail = async () => {
        setIsActionLoading(true);
        try {
            await resendVerificationEmail();
            showToast('Verification email sent.');
        } catch (error) {
            showToast('Unable to send verification email.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleChangeEmail = async (payload: { newEmail: string; password: string }) => {
        setIsActionLoading(true);
        try {
            await changeEmail(payload);
            setIsEmailModalOpen(false);
            await fetchStatus();
            showToast('Email updated. Please verify your new email.');
        } catch (error) {
            showToast('Unable to update email.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handlePasswordChange = async (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
        if (payload.newPassword !== payload.confirmPassword) {
            showToast('Passwords do not match.');
            return;
        }
        setIsActionLoading(true);
        try {
            const response = await changePassword({currentPassword: payload.currentPassword, newPassword: payload.newPassword});
            showToast(response.message || 'Password updated. Please sign in again.');
            if (response.mode === 'logout') {
                window.location.href = '/logIn';
                return;
            }
            await fetchStatus();
        } catch (error) {
            showToast('Unable to update password. Please request a reset email.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDownloadReport = async () => {
        setIsActionLoading(true);
        try {
            const file = await downloadSecurityReport();
            const url = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'security-report.json';
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            showToast('Unable to download report.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDeleteAccount = async (payload: { confirmation: string; password: string }) => {
        setIsActionLoading(true);
        try {
            await deleteAccount(payload);
            showToast('Account deleted.');
            window.location.href = '/';
        } catch (error) {
            showToast('Unable to delete account.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleLogoutSession = async (id: string) => {
        setIsActionLoading(true);
        try {
            await revokeSession(id);
            await fetchStatus();
            showToast('Session revoked.');
        } catch (error) {
            showToast('Unable to revoke session.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleLogoutAllSessions = async () => {
        setIsActionLoading(true);
        try {
            await revokeAllSessions();
            showToast('All sessions revoked. Please sign in again.');
            window.location.href = '/logIn';
        } catch (error) {
            showToast('Unable to revoke sessions.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleResetPassword = () => {
        setIsActionLoading(true);
        sendResetPasswordEmail()
            .then(() => showToast('Reset password email sent.'))
            .catch(() => showToast('Unable to send reset email.'))
            .finally(() => setIsActionLoading(false));
    };

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
            <SecurityBanner show={requiresBanner} onSetup2fa={handleSetup2fa} />
            <div className="security-grid">
                <TwoFactorCard
                    isEnabled={Boolean(status?.twoFactorEnabled)}
                    backupCodesGenerated={backupGenerated}
                    isLoading={isLoading}
                    onPrimaryAction={status?.twoFactorEnabled ? handleManage2fa : handleSetup2fa}
                />
                <EmailVerificationCard
                    emailVerified={Boolean(status?.emailVerified)}
                    isLoading={isActionLoading || isLoading}
                    onResend={handleResendEmail}
                    onChangeEmail={() => setIsEmailModalOpen(true)}
                />
            </div>
            <PasswordCard
                isSubmitting={isActionLoading}
                lastUpdatedLabel={passwordUpdatedLabel}
                onSubmit={handlePasswordChange}
                onReset={handleResetPassword}
            />
            <div className="security-bottom-grid">
                <ActiveSessionsCard
                    sessions={status?.sessions ?? []}
                    isLoading={isLoading}
                    onLogoutSession={handleLogoutSession}
                    onLogoutAll={handleLogoutAllSessions}
                />
                <DangerZoneCard
                    onDelete={() => setIsDeleteOpen(true)}
                    onDownloadReport={handleDownloadReport}
                />
            </div>
            <RecommendationsRow />

            <ChangeEmailModal
                isOpen={isEmailModalOpen}
                isSubmitting={isActionLoading}
                onClose={() => setIsEmailModalOpen(false)}
                onSubmit={handleChangeEmail}
            />
            <DeleteAccountModal
                isOpen={isDeleteOpen}
                isSubmitting={isActionLoading}
                onClose={() => setIsDeleteOpen(false)}
                onConfirm={handleDeleteAccount}
            />
            {toast && <div className="security-toast">{toast}</div>}
        </AccountShell>
    );
};

export default AccountSecurityPage;
