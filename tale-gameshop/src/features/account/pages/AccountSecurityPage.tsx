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

    const backupGenerated = Boolean(status?.backupCodesGenerated);

    const passwordUpdatedLabel = useMemo(() => {
        if (!status?.passwordUpdatedAt) {
            return 'recently';
        }
        const date = new Date(status.passwordUpdatedAt);
        if (Number.isNaN(date.getTime())) {
            return 'recently';
        }
        return `on ${date.toLocaleDateString()}`;
    }, [status?.passwordUpdatedAt]);

    const requiresBanner = useMemo(() => {
        if (!status) {
            return false;
        }
        return !status.emailVerified || !status.twoFactorEnabled;
    }, [status]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleResendEmail = useCallback(async () => {
        setIsActionLoading(true);
        try {
            await resendVerificationEmail();
            showToast('Verification email sent.');
        } catch (error) {
            showToast('Unable to resend verification email.');
        } finally {
            setIsActionLoading(false);
        }
    }, [showToast]);

    const handleChangeEmail = useCallback(async (payload: { newEmail: string; password: string }) => {
        setIsActionLoading(true);
        try {
            await changeEmail(payload);
            setIsEmailModalOpen(false);
            showToast('Email updated. Check your inbox to verify it.');
            await fetchStatus();
        } catch (error) {
            showToast('Unable to update email.');
        } finally {
            setIsActionLoading(false);
        }
    }, [fetchStatus, showToast]);

    const handlePasswordChange = useCallback(async (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
        setIsActionLoading(true);
        try {
            const response = await changePassword({currentPassword: payload.currentPassword, newPassword: payload.newPassword});
            showToast(response.message || 'Password updated.');
            if (response.redirectUrl) {
                window.open(response.redirectUrl, '_blank', 'noopener');
            }
            if (response.mode === 'logout') {
                setTimeout(() => window.location.reload(), 1000);
            }
            await fetchStatus();
        } catch (error) {
            showToast('Unable to update password.');
        } finally {
            setIsActionLoading(false);
        }
    }, [fetchStatus, showToast]);

    const handleResetPassword = useCallback(async () => {
        setIsActionLoading(true);
        try {
            await sendResetPasswordEmail();
            showToast('Password reset email sent.');
        } catch (error) {
            showToast('Unable to send reset email.');
        } finally {
            setIsActionLoading(false);
        }
    }, [showToast]);

    const handleSetup2fa = useCallback(async () => {
        setIsActionLoading(true);
        try {
            const response = await setupTwoFactor();
            showToast(response.message || 'Follow the instructions to finish enabling 2FA.');
            if (response.redirectUrl) {
                window.open(response.redirectUrl, '_blank', 'noopener');
            }
            await fetchStatus();
        } catch (error) {
            showToast('Unable to start 2FA setup.');
        } finally {
            setIsActionLoading(false);
        }
    }, [fetchStatus, showToast]);

    const handleManage2fa = useCallback(() => {
        if (status?.accountConsoleUrl) {
            window.open(status.accountConsoleUrl, '_blank', 'noopener');
        } else {
            showToast('Account console is unavailable.');
        }
    }, [showToast, status?.accountConsoleUrl]);

    const handleLogoutSession = useCallback(async (id: string) => {
        setIsActionLoading(true);
        try {
            await revokeSession(id);
            showToast('Session logged out.');
            await fetchStatus();
        } catch (error) {
            showToast('Unable to log out session.');
        } finally {
            setIsActionLoading(false);
        }
    }, [fetchStatus, showToast]);

    const handleLogoutAllSessions = useCallback(async () => {
        setIsActionLoading(true);
        try {
            await revokeAllSessions();
            showToast('All sessions logged out.');
            await fetchStatus();
        } catch (error) {
            showToast('Unable to log out all sessions.');
        } finally {
            setIsActionLoading(false);
        }
    }, [fetchStatus, showToast]);

    const handleDownloadReport = useCallback(async () => {
        setIsActionLoading(true);
        try {
            const report = await downloadSecurityReport();
            const url = window.URL.createObjectURL(report);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'security-report.json';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            showToast('Security report downloaded.');
        } catch (error) {
            showToast('Unable to download report.');
        } finally {
            setIsActionLoading(false);
        }
    }, [showToast]);

    const handleDeleteAccount = useCallback(async (payload: { confirmation: string; password: string }) => {
        setIsActionLoading(true);
        try {
            await deleteAccount(payload);
            setIsDeleteOpen(false);
            showToast('Account deletion requested.');
        } catch (error) {
            showToast('Unable to delete account.');
        } finally {
            setIsActionLoading(false);
        }
    }, [showToast]);
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
