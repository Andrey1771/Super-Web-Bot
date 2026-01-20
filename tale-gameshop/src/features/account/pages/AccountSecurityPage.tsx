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
import Enable2FAModal from '../security/modals/Enable2FAModal';
import Manage2FAModal from '../security/modals/Manage2FAModal';
import DeleteAccountModal from '../security/modals/DeleteAccountModal';
import container from '../../../inversify.config';
import IDENTIFIERS from '../../../constants/identifiers';
import type {IUrlService} from '../../../iterfaces/i-url-service';
import {
    changeEmail,
    changePassword,
    deleteAccount,
    disableTwoFactor,
    downloadSecurityReport,
    enableTwoFactor,
    fetchTwoFactorSetup,
    getAccountSecurityProfile,
    getActiveSessions,
    regenerateBackupCodes,
    resendVerificationEmail,
    revokeAllSessions,
    revokeSession
} from '../security/api/securityApi';
import type {AccountSecurityProfile, AccountSession, TwoFactorSetup} from '../security/types';
import './account-security-page.css';

const AccountSecurityPage: React.FC = () => {
    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
    const [profile, setProfile] = useState<AccountSecurityProfile | null>(null);
    const [sessions, setSessions] = useState<AccountSession[]>([]);
    const [toast, setToast] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSessionLoading, setIsSessionLoading] = useState(true);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isEnable2faOpen, setIsEnable2faOpen] = useState(false);
    const [isManage2faOpen, setIsManage2faOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null);
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const showToast = useCallback((message: string) => {
        setToast(message);
        setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchProfile = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getAccountSecurityProfile();
            setProfile(data);
        } catch (error) {
            showToast('Unable to load account profile.');
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    const fetchSessions = useCallback(async () => {
        setIsSessionLoading(true);
        try {
            const data = await getActiveSessions();
            setSessions(data);
        } catch (error) {
            showToast('Unable to load sessions.');
        } finally {
            setIsSessionLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchProfile();
        fetchSessions();
    }, [fetchProfile, fetchSessions]);

    const requiresBanner = useMemo(() => {
        if (!profile) {
            return false;
        }
        return !profile.emailVerified || !profile.isTwoFactorEnabled;
    }, [profile]);

    const backupGenerated = useMemo(
        () => Boolean(profile?.hasBackupCodes || (backupCodes && backupCodes.length > 0)),
        [backupCodes, profile]
    );

    const passwordUpdatedLabel = useMemo(() => {
        if (!profile?.lastPasswordChangeAt) {
            return 'over 6 months ago';
        }
        const last = new Date(profile.lastPasswordChangeAt).getTime();
        const diffMonths = Math.max(1, Math.floor((Date.now() - last) / (1000 * 60 * 60 * 24 * 30)));
        return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
    }, [profile]);

    const handleSetup2fa = async () => {
        setIsEnable2faOpen(true);
        setBackupCodes(null);
        try {
            const setup = await fetchTwoFactorSetup();
            setTwoFactorSetup(setup);
        } catch (error) {
            showToast('Unable to prepare 2FA setup.');
        }
    };

    const handleEnable2fa = async (payload: { code: string; password: string }) => {
        setIsActionLoading(true);
        try {
            const response = await enableTwoFactor(payload);
            setBackupCodes(response.backupCodes);
            await fetchProfile();
            showToast('Two-factor authentication enabled.');
        } catch (error) {
            showToast('Unable to enable 2FA.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleManage2fa = () => {
        setIsManage2faOpen(true);
        setBackupCodes(null);
    };

    const handleRegenerateCodes = async (payload: { code: string; password: string }) => {
        setIsActionLoading(true);
        try {
            const response = await regenerateBackupCodes(payload);
            setBackupCodes(response.backupCodes);
            showToast('Backup codes regenerated.');
        } catch (error) {
            showToast('Unable to regenerate backup codes.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDisable2fa = async (payload: { code: string; password: string }) => {
        setIsActionLoading(true);
        try {
            await disableTwoFactor(payload);
            await fetchProfile();
            setIsManage2faOpen(false);
            showToast('Two-factor authentication disabled.');
        } catch (error) {
            showToast('Unable to disable 2FA.');
        } finally {
            setIsActionLoading(false);
        }
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
            await fetchProfile();
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
            await changePassword({currentPassword: payload.currentPassword, newPassword: payload.newPassword});
            await fetchProfile();
            showToast('Password updated.');
        } catch (error) {
            showToast('Unable to update password.');
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

    const handleDeleteAccount = async (payload: { confirmation: string; password: string; twoFactorCode?: string }) => {
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
            await fetchSessions();
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
            await fetchSessions();
            showToast('All sessions revoked.');
        } catch (error) {
            showToast('Unable to revoke sessions.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleResetPassword = () => {
        const redirect = encodeURIComponent(window.location.origin + '/account/security');
        const resetUrl = `${urlService.keycloak.url}realms/${urlService.keycloak.realm}/login-actions/reset-credentials?client_id=${urlService.keycloak.clientId}&redirect_uri=${redirect}`;
        window.location.href = resetUrl;
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
                    isEnabled={Boolean(profile?.isTwoFactorEnabled)}
                    backupCodesGenerated={backupGenerated}
                    isLoading={isLoading}
                    onPrimaryAction={profile?.isTwoFactorEnabled ? handleManage2fa : handleSetup2fa}
                />
                <EmailVerificationCard
                    emailVerified={Boolean(profile?.emailVerified)}
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
                    sessions={sessions}
                    isLoading={isSessionLoading}
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
            <Enable2FAModal
                isOpen={isEnable2faOpen}
                isLoading={isActionLoading}
                setup={twoFactorSetup}
                backupCodes={backupCodes}
                onClose={() => setIsEnable2faOpen(false)}
                onConfirm={handleEnable2fa}
            />
            <Manage2FAModal
                isOpen={isManage2faOpen}
                isLoading={isActionLoading}
                backupCodes={backupCodes}
                onClose={() => setIsManage2faOpen(false)}
                onRegenerate={handleRegenerateCodes}
                onDisable={handleDisable2fa}
            />
            <DeleteAccountModal
                isOpen={isDeleteOpen}
                isSubmitting={isActionLoading}
                requiresTwoFactor={Boolean(profile?.isTwoFactorEnabled)}
                onClose={() => setIsDeleteOpen(false)}
                onConfirm={handleDeleteAccount}
            />
            {toast && <div className="security-toast">{toast}</div>}
        </AccountShell>
    );
};

export default AccountSecurityPage;
