import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import AccountShell from '../components/AccountShell';
import { useRecommendations } from '../../../hooks/use-recommendations';
import RecommendationsSection from '../../../components/recommendations/recommendations-section';
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

const SecurityBottomSection: React.FC = () => {
    const {
        items: recommendations,
        isLoading: isRecommendationsLoading,
        error: recommendationsError,
        reload: reloadRecommendations
    } = useRecommendations(6);

    const requiresBanner = useMemo(() => {
        if (!status) {
            return false;
        }
        return !status.emailVerified || !status.twoFactorEnabled;
    }, [status]);

            <section className="security-recommendations" data-testid="security-recommendations">
                <div className="security-recommendations-header">
                    <h3>Recommendations based on your wishlist</h3>
                    <div className="security-recommendations-actions">
                        <button type="button" className="btn btn-outline security-arrow-btn" aria-label="Scroll left">
                            <FontAwesomeIcon icon={faChevronLeft} />
                        </button>
                        <button type="button" className="btn btn-outline security-arrow-btn" aria-label="Scroll right">
                            <FontAwesomeIcon icon={faChevronRight} />
                        </button>
                    </div>
                </div>
                <RecommendationsSection
                    items={recommendations}
                    isLoading={isRecommendationsLoading}
                    error={recommendationsError}
                    onRetry={reloadRecommendations}
                    emptyMessage="Add games to your wishlist or view a few games to get recommendations."
                    listClassName="security-recommendations-list"
                    stateClassName="security-recommendations-state"
                    renderSkeleton={(index) => (
                        <div key={`rec-skeleton-${index}`} className="card security-recommendation-card is-skeleton" />
                    )}
                    renderItem={(item) => (
                        <div key={item.game.id ?? item.game.title} className="card security-recommendation-card">
                            <div className="security-recommendation-media">
                                {item.game.imagePath ? (
                                    <img src={item.game.imagePath} alt={item.game.title} />
                                ) : (
                                    <div className="security-recommendation-fallback" aria-hidden="true" />
                                )}
                            </div>
                            <div className="security-recommendation-body">
                                <strong>{item.game.title}</strong>
                                <span className="security-recommendation-price">
                                    ${Number(item.game.price).toFixed(2)}
                                </span>
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary security-recommendation-btn"
                                disabled={!item.game.id}
                            >
                                Add to cart
                            </button>
                        </div>
                    )}
                />
            </section>
        </>
    );
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
