import {useTranslation} from 'react-i18next';
import {currentLang} from '../../../context/site-preferences';
import i18n from '../../../i18n';
import React, {useCallback, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import AccountShell from '../components/AccountShell';
import SecurityChecklist from '../security/components/SecurityChecklist';
import type {SecurityChecklistStep} from '../security/components/SecurityChecklist';
import TwoFactorCard from '../security/components/TwoFactorCard';
import EmailVerificationCard from '../security/components/EmailVerificationCard';
import PasswordCard from '../security/components/PasswordCard';
import ActiveSessionsCard from '../security/components/ActiveSessionsCard';
import DangerZoneCard from '../security/components/DangerZoneCard';
import ChangeEmailModal from '../security/modals/ChangeEmailModal';
import DeleteAccountModal from '../security/modals/DeleteAccountModal';
import Enable2FAModal from '../security/modals/Enable2FAModal';
import Manage2FAModal from '../security/modals/Manage2FAModal';
import {
    changeEmail,
    changePassword,
    deleteAccount,
    disableTwoFactor,
    downloadSecurityReport,
    getAccountSecurityStatus,
    resendVerificationEmail,
    revokeAllSessions,
    revokeSession,
    sendResetPasswordEmail
} from '../security/api/securityApi';
import type {AccountSecurityStatus, SecurityActionResponse} from '../security/types';
import {useKeycloak} from '@react-keycloak/web';
import type {IKeycloakAuthService} from '../../../iterfaces/i-keycloak-auth-service';
import container from '../../../inversify.config';
import IDENTIFIERS from '../../../constants/identifiers';
import './account-security-page.css';

// null — даты нет или она нечитаемая; строку про обновление пароля в этом случае не показываем.
const getRelativePasswordLabel = (value?: string | null): string | null => {
    if (!value) {
        return null;
    }
    const lastUpdated = new Date(value);
    if (Number.isNaN(lastUpdated.getTime())) {
        return null;
    }
    const diffDays = Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 1) {
        return i18n.t('common.today');
    }
    if (diffDays < 30) {
        return i18n.t('account.security.daysAgo', { count: diffDays });
    }
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) {
        return i18n.t('account.security.monthsAgo', { count: diffMonths });
    }
    return i18n.t('common.overYearAgo');
};

const AccountSecurityPage: React.FC = () => {
    const {t} = useTranslation();
    const {keycloak} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);
    const [status, setStatus] = useState<AccountSecurityStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // Запрос не прошёл. Без этого признака страница отличала «грузится» от «загружено»
    // только по наличию данных, и после ошибки карточки крутили скелетон вечно: тост
    // с ошибкой уезжал через четыре секунды, а «Loading» оставался навсегда.
    const [loadFailed, setLoadFailed] = useState(false);
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
            setLoadFailed(false);
        } catch (error) {
            setLoadFailed(true);
            showToast(t('account.security.toast.loadFailed'));
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    React.useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    // Возвращает true при успехе — карточка email по этому признаку запускает кулдаун повторной отправки.
    const handleResendEmail = async (): Promise<boolean> => {
        setIsSubmitting(true);
        try {
            await resendVerificationEmail();
            showToast(t('account.security.toast.verificationSent'));
            return true;
        } catch (error) {
            showToast(t('account.security.toast.resendFailed'));
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChangeEmail = async (payload: { newEmail: string; password: string }) => {
        setIsSubmitting(true);
        try {
            await changeEmail(payload);
            showToast(t('account.security.toast.emailUpdated'));
            setIsChangeEmailOpen(false);
            await fetchStatus();
        } catch (error) {
            showToast(t('account.security.toast.emailFailed'));
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
            showToast(response.message || t('account.security.toast.passwordUpdated'));
            if (response.mode === 'logout') {
                await keycloakAuthService.logoutWithRedirect(keycloak, window.location.origin);
            } else {
                await fetchStatus();
            }
        } catch (error) {
            showToast(t('account.security.toast.passwordFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordReset = async () => {
        setIsSubmitting(true);
        try {
            await sendResetPasswordEmail();
            showToast(t('account.security.toast.resetSent'));
        } catch (error) {
            showToast(t('account.security.toast.resetFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSetup2fa = () => {
        // Application-Initiated Action: ведём пользователя через его же login-флоу Keycloak
        // (kc_action=CONFIGURE_TOTP). Keycloak покажет страницу настройки TOTP (QR) в теме логина
        // и вернёт обратно в приложение — без письма и без account-консоли (которая отдаёт 401).
        // keycloak-js типизирует action узко как 'register', хотя адаптер шлёт любой kc_action.
        keycloak.login({
            action: 'CONFIGURE_TOTP',
            redirectUri: `${window.location.origin}/account/security`,
            locale: currentLang()
        } as any);
    };

    const handleDisable2fa = async () => {
        setIsSubmitting(true);
        try {
            const hadBackupCodes = Boolean(status?.backupCodesGenerated);
            await disableTwoFactor();
            showToast(hadBackupCodes
                ? t('account.security.toast.twoFactorDisabledCodes')
                : t('account.security.toast.twoFactorDisabled'));
            await fetchStatus();
        } catch (error) {
            showToast(t('account.security.toast.disableFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenManage2fa = () => {
        // Перенастройка TOTP — тоже через AIA login-флоу Keycloak (без account-консоли).
        // keycloak-js типизирует action узко как 'register', хотя адаптер шлёт любой kc_action.
        keycloak.login({
            action: 'CONFIGURE_TOTP',
            redirectUri: `${window.location.origin}/account/security`,
            locale: currentLang()
        } as any);
    };

    const handleGenerateBackupCodes = () => {
        // Recovery-коды — тот же AIA-флоу, что и TOTP. Требует фичи recovery-codes у Keycloak
        // (включена в docker-compose); после генерации Keycloak вернёт пользователя сюда.
        keycloak.login({
            action: 'CONFIGURE_RECOVERY_AUTHN_CODES',
            redirectUri: `${window.location.origin}/account/security`,
            locale: currentLang()
        } as any);
    };

    const handleLogoutSession = async (sessionId: string) => {
        setIsSubmitting(true);
        try {
            await revokeSession(sessionId);
            showToast(t('account.security.toast.sessionRevoked'));
            await fetchStatus();
        } catch (error) {
            showToast(t('account.security.toast.sessionFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLogoutAll = async () => {
        setIsSubmitting(true);
        try {
            await revokeAllSessions();
            showToast(t('account.security.toast.allRevoked'));
            await fetchStatus();
        } catch (error) {
            showToast(t('account.security.toast.allFailed'));
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
            showToast(t('account.security.toast.reportDownloaded'));
        } catch (error) {
            showToast(t('account.security.toast.reportFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteAccount = async (payload: { confirmation: string; password: string; twoFactorCode?: string }) => {
        setIsSubmitting(true);
        try {
            await deleteAccount(payload);
            showToast(t('account.security.toast.accountDeleted'));
            setIsDeleteAccountOpen(false);
            await keycloakAuthService.logoutWithRedirect(keycloak, window.location.origin);
        } catch (error) {
            showToast(t('account.security.toast.deleteFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    // Чеклист можно закрыть, но только до конца сессии браузера (sessionStorage):
    // навсегда прятать напоминание о незащищённом аккаунте нельзя — вернуть его иначе неоткуда.
    const [checklistDismissed, setChecklistDismissed] = useState(
        () => sessionStorage.getItem('security_checklist_dismissed') === '1'
    );
    const handleDismissChecklist = () => {
        sessionStorage.setItem('security_checklist_dismissed', '1');
        setChecklistDismissed(true);
    };

    // Последовательное ведение к защищённому аккаунту: один primary-CTA на следующий незакрытый шаг.
    const checklistSteps: SecurityChecklistStep[] = [
        {
            key: 'email',
            label: t('account.security.checklist.verifyEmail'),
            done: Boolean(status?.emailVerified),
            actionLabel: t('account.security.checklist.resendEmail'),
            onAction: () => { void handleResendEmail(); }
        },
        {
            key: '2fa',
            label: t('account.security.checklist.enable2fa'),
            done: Boolean(status?.twoFactorEnabled),
            actionLabel: t('account.security.checklist.enable2faAction'),
            onAction: handleSetup2fa
        },
        {
            key: 'backup-codes',
            label: t('account.security.checklist.backupCodes'),
            // Исчерпанный набор (0 оставшихся) — то же, что отсутствие кодов: шаг снова не выполнен.
            done: Boolean(status?.backupCodesGenerated) && (status?.backupCodesRemaining == null || status.backupCodesRemaining > 0),
            actionLabel: t('account.security.checklist.backupCodesAction'),
            onAction: handleGenerateBackupCodes
        }
    ];
    // Показываем только по загруженному статусу, чтобы чеклист не мигал до ответа сервера.
    const checklistVisible = !checklistDismissed && status !== null && checklistSteps.some((step) => !step.done);
    const passwordUpdatedLabel = useMemo(() => getRelativePasswordLabel(status?.passwordUpdatedAt ?? null), [status?.passwordUpdatedAt]);

    return (
        <AccountShell
            title={t('account.security.title')}
            sectionLabel={t('account.security.title')}
            subtitle={t('account.security.subtitle')}
            headerTestId="security-header"
        >
            <SecurityChecklist
                show={checklistVisible}
                steps={checklistSteps}
                isBusy={isSubmitting}
                onDismiss={handleDismissChecklist}
            />

            {loadFailed ? (
                <div className="card security-card" data-testid="security-load-error" role="alert">
                    <div className="security-card-header">
                        <h3>{t('account.security.unavailable')}</h3>
                    </div>
                    <p>
                        {t('account.security.unavailableText')}
                    </p>
                    <div className="security-card-actions">
                        <button
                            type="button"
                            className="btn btn-primary security-action-btn"
                            onClick={fetchStatus}
                            disabled={isLoading}
                        >
                            {isLoading ? t('common.retrying') : t('common.tryAgain')}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="security-grid">
                    {/* Скелетон — только пока данных нет ни разу: обновление после действия
                        не должно превращать заполненную карточку обратно в заглушку. */}
                    <TwoFactorCard
                        isEnabled={Boolean(status?.twoFactorEnabled)}
                        backupCodesGenerated={Boolean(status?.backupCodesGenerated)}
                        backupCodesTotal={status?.backupCodesTotal ?? null}
                        backupCodesRemaining={status?.backupCodesRemaining ?? null}
                        isPending={isLoading && status === null}
                        isBusy={isSubmitting}
                        onPrimaryAction={status?.twoFactorEnabled ? handleOpenManage2fa : handleSetup2fa}
                        onDisable={handleDisable2fa}
                        onGenerateBackupCodes={handleGenerateBackupCodes}
                    />
                    <EmailVerificationCard
                        emailVerified={Boolean(status?.emailVerified)}
                        isPending={isLoading && status === null}
                        isBusy={isSubmitting}
                        onResend={handleResendEmail}
                        onChangeEmail={() => setIsChangeEmailOpen(true)}
                    />
                </div>
            )}

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
