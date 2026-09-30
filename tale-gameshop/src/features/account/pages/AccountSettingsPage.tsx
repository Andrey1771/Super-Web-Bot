import { useTranslation } from 'react-i18next';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {Link} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faPen} from '@fortawesome/free-solid-svg-icons';
import {faTelegram} from '@fortawesome/free-brands-svg-icons';
import AccountShell from '../components/AccountShell';
import AvatarCropModal from '../components/AvatarCropModal';
import ModalConfirm from '../../../components/ui/ModalConfirm';
import { useToast } from '../../../components/ui/ToastProvider';
import { fetchAccountProfile, saveAccountProfile } from '../../../api/accountApi';
import { getMyNewsletter, setMyNewsletter } from '../../../api/newsletterApi';
import { getTelegramStatus, createTelegramLinkToken, unlinkTelegram, type TelegramLinkStatus } from '../../../api/telegramLinkApi';
import { useAccountProfile } from '../context/AccountProfileContext';
import './account-settings-page.css';

// Единственная настраиваемая email-рубрика — рассылка скидок (реальная подписка на сервере).
// Security-письма (восстановление аккаунта и т.п.) — транзакционные, их отключить нельзя.
type NotificationPrefs = {
    promotions: boolean;
};

const NOTIFICATIONS_STORAGE_KEY = 'settings_notifications';
const defaultNotifications: NotificationPrefs = { promotions: true };

const readNotifications = (): NotificationPrefs => {
    try {
        const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
        return raw ? { ...defaultNotifications, ...(JSON.parse(raw) as Partial<NotificationPrefs>) } : defaultNotifications;
    } catch {
        return defaultNotifications;
    }
};

const AccountSettingsPage: React.FC = () => {
    const { t } = useTranslation();
    const { profile, updateAvatar } = useAccountProfile();
    const { addToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const draftAvatarPreviewUrlRef = useRef<string | null>(null);
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
    const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
    const [draftAvatarFile, setDraftAvatarFile] = useState<File | null>(null);
    const [draftAvatarPreviewUrl, setDraftAvatarPreviewUrl] = useState<string | null>(null);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [savedAvatarUrl, setSavedAvatarUrl] = useState<string | null>(profile?.avatarUrl ?? null);
    const [pendingAvatarRemoval, setPendingAvatarRemoval] = useState(false);
    const [displayNameInput, setDisplayNameInput] = useState(profile?.displayName ?? t('common.user'));
    const [emailInput, setEmailInput] = useState(profile?.email ?? '');
    const [notifications, setNotifications] = useState<NotificationPrefs>(readNotifications);
    const [isSavingPreferences, setIsSavingPreferences] = useState(false);
    // Письма о новых скидках. В localStorage не кладём в отличие от соседней галочки:
    // значение серверное, и локальная копия показывала бы прежний выбор на чужом
    // устройстве — до тех пор, пока не ответит /me.
    const [dealAlerts, setDealAlerts] = useState(true);
    const [telegram, setTelegram] = useState<TelegramLinkStatus | null>(null);
    const [isTelegramBusy, setIsTelegramBusy] = useState(false);
    // Бот не настроен на сервере (503). Это не сбой связи: повторять попытку бессмысленно,
    // пока в окружении нет токена бота, — поэтому и предлагать «попробуйте ещё раз» нельзя.
    const [isTelegramUnavailable, setIsTelegramUnavailable] = useState(false);
    // Человек ушёл в бота — по возвращении на вкладку статус перечитывается сам, без кнопки «Refresh».
    const awaitingTelegramLink = useRef(false);
    const [isUnlinkModalOpen, setIsUnlinkModalOpen] = useState(false);

    // «Promotions» — не локальная галочка, а реальная подписка на рассылку,
    // привязанная к email аккаунта (см. NewsletterController /me).
    useEffect(() => {
        getMyNewsletter()
            .then((my) => {
                setNotifications((prev) => ({ ...prev, promotions: my.subscribed }));
                setDealAlerts(my.dealAlerts);
            })
            .catch(() => { /* backend недоступен — оставляем локальное значение */ });
    }, []);

    useEffect(() => {
        getTelegramStatus()
            .then(setTelegram)
            .catch(() => setTelegram({ linked: false }));
    }, []);

    const handleConnectTelegram = async () => {
        setIsTelegramBusy(true);
        try {
            const token = await createTelegramLinkToken();
            // Открываем бота с deep-link: /start <token> привяжет чат к аккаунту.
            window.open(token.deepLink, '_blank', 'noopener,noreferrer');
            awaitingTelegramLink.current = true;
            addToast(t('account.settings.toast.openingTelegram'), 'info');
        } catch (error) {
            console.error(error);

            // 503 приходит от бот-сервиса, когда у него нет токена: он не может узнать имя бота,
            // а без имени нет и ссылки на диалог. Отличаем это от временной неудачи — иначе
            // человек будет жать кнопку по кругу, а мешает ему настройка сервера.
            const status = (error as { response?: { status?: number } })?.response?.status;
            if (status === 503) {
                setIsTelegramUnavailable(true);
                addToast(t('account.settings.toast.telegramNotConfigured'), 'error');
            } else {
                addToast(t('account.settings.toast.telegramStartFailed'), 'error');
            }
        } finally {
            setIsTelegramBusy(false);
        }
    };

    const handleRefreshTelegram = async () => {
        setIsTelegramBusy(true);
        try {
            const next = await getTelegramStatus();
            setTelegram(next);
            if (next.linked) {
                awaitingTelegramLink.current = false;
            }
        } catch (error) {
            console.error(error);
            addToast(t('account.settings.toast.telegramRefreshFailed'), 'error');
        } finally {
            setIsTelegramBusy(false);
        }
    };

    // Вернулись со вкладки Telegram — проверяем, привязался ли чат. Кнопка «Refresh» этому
    // не нужна: раньше без неё человек не знал, что делать после Start в боте.
    useEffect(() => {
        const onReturn = () => {
            if (document.visibilityState === 'visible' && awaitingTelegramLink.current) {
                void handleRefreshTelegram();
            }
        };
        document.addEventListener('visibilitychange', onReturn);
        window.addEventListener('focus', onReturn);
        return () => {
            document.removeEventListener('visibilitychange', onReturn);
            window.removeEventListener('focus', onReturn);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleUnlinkTelegram = async () => {
        setIsUnlinkModalOpen(false);
        setIsTelegramBusy(true);
        try {
            await unlinkTelegram();
            setTelegram({ linked: false });
            addToast(t('account.settings.toast.telegramDisconnected'), 'success');
        } catch (error) {
            console.error(error);
            addToast(t('account.settings.toast.telegramDisconnectFailed'), 'error');
        } finally {
            setIsTelegramBusy(false);
        }
    };

    const displayName = profile?.displayName ?? t('common.user');

    useEffect(() => {
        if (isAvatarModalOpen) {
            return;
        }

        setSavedAvatarUrl(profile?.avatarUrl ?? null);
        setDisplayNameInput(profile?.displayName ?? t('common.user'));
        setEmailInput(profile?.email ?? '');
        setPendingAvatarRemoval(false);
    }, [profile?.avatarUrl, profile?.displayName, profile?.email, isAvatarModalOpen]);

    const replaceDraftAvatarPreviewUrl = (nextUrl: string | null) => {
        if (draftAvatarPreviewUrlRef.current) {
            URL.revokeObjectURL(draftAvatarPreviewUrlRef.current);
        }
        draftAvatarPreviewUrlRef.current = nextUrl;
        setDraftAvatarPreviewUrl(nextUrl);
    };

    const clearAvatarDraft = () => {
        setDraftAvatarFile(null);
        replaceDraftAvatarPreviewUrl(null);
    };

    useEffect(() => {
        return () => {
            if (draftAvatarPreviewUrlRef.current) {
                URL.revokeObjectURL(draftAvatarPreviewUrlRef.current);
                draftAvatarPreviewUrlRef.current = null;
            }
        };
    }, []);

    const initials = useMemo(() => {
        return displayName
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join('')
            .toUpperCase();
    }, [displayName]);

    const openFileDialog = () => fileInputRef.current?.click();

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) {
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            addToast(t('account.settings.toast.fileTooLarge'), 'error');
            return;
        }
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            addToast(t('account.settings.toast.unsupportedFormat'), 'error');
            return;
        }
        const nextUrl = URL.createObjectURL(file);
        setPendingAvatarRemoval(false);
        replaceDraftAvatarPreviewUrl(nextUrl);
        setIsAvatarModalOpen(true);
    };

    const closeAvatarModal = () => {
        setIsAvatarModalOpen(false);
        clearAvatarDraft();
    };

    const handleAvatarDraftSave = async (file: File) => {
        const nextPreviewUrl = URL.createObjectURL(file);
        setDraftAvatarFile(file);
        setPendingAvatarRemoval(false);
        replaceDraftAvatarPreviewUrl(nextPreviewUrl);
        setIsAvatarModalOpen(false);
    };

    const handleSaveProfile = async () => {
        setIsSavingProfile(true);
        try {
            const profileResponse = await saveAccountProfile({
                displayName: displayNameInput,
                email: emailInput,
                avatar: draftAvatarFile,
                removeAvatar: pendingAvatarRemoval && !draftAvatarFile
            });

            const refreshedProfile = await fetchAccountProfile();
            const nextAvatarUrl = refreshedProfile.avatarUrl ?? profileResponse.avatarUrl ?? null;
            updateAvatar(nextAvatarUrl);
            setSavedAvatarUrl(nextAvatarUrl);
            setDisplayNameInput(refreshedProfile.displayName ?? displayNameInput);
            setEmailInput(refreshedProfile.email ?? emailInput);
            clearAvatarDraft();
            setPendingAvatarRemoval(false);
            addToast(t('account.settings.toast.profileUpdated'), 'success');
        } catch (error) {
            console.error(error);
            addToast(t('account.settings.toast.profileSaveFailed'), 'error');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleSavePreferences = async () => {
        setIsSavingPreferences(true);
        try {
            localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
            // Подписка на рассылку — серверная: включает/выключает письма для email аккаунта.
            await setMyNewsletter(notifications.promotions, dealAlerts);
            addToast(t('account.settings.toast.prefsSaved'), 'success');
        } catch (error) {
            console.error(error);
            addToast(t('account.settings.toast.newsletterFailed'), 'error');
        } finally {
            setIsSavingPreferences(false);
        }
    };

    const handleRemove = () => {
        setPendingAvatarRemoval(true);
        clearAvatarDraft();
        setIsRemoveModalOpen(false);
        addToast(t('account.settings.toast.avatarRemoveLater'), 'info');
    };

    const avatarDisplayUrl = draftAvatarPreviewUrl ?? (pendingAvatarRemoval ? null : savedAvatarUrl);

    return (
        <AccountShell
            title={t('account.settings.title')}
            sectionLabel={t('account.settings.title')}
            subtitle={t('account.settings.subtitle')}
        >
            <div className="card settings-card" data-testid="settings-profile">
                <div className="settings-card-header">
                    <h3>{t('account.settings.profile')}</h3>
                </div>
                <div className="settings-avatar-block">
                    <button type="button" className="settings-avatar" onClick={openFileDialog}>
                        {avatarDisplayUrl ? (
                            <img src={avatarDisplayUrl} alt={t('account.avatarAlt', { name: displayName })} />
                        ) : (
                            <span>{initials}</span>
                        )}
                        <span className="settings-avatar-edit" aria-hidden="true">
                            <FontAwesomeIcon icon={faPen} />
                        </span>
                    </button>
                    <div className="settings-avatar-actions">
                        <div>
                            <strong>{t('account.settings.avatar')}</strong>
                            <p className="settings-avatar-hint">{t('account.settings.avatarHint')}</p>
                        </div>
                        <div className="settings-avatar-buttons">
                            <button type="button" className="btn btn-primary" onClick={openFileDialog} disabled={isSavingProfile}>
                                {t('account.settings.uploadPhoto')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => setIsRemoveModalOpen(true)}
                                disabled={!savedAvatarUrl || isSavingProfile || pendingAvatarRemoval}
                            >
                                {t('common.remove')}
                            </button>
                        </div>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="settings-avatar-input"
                        onChange={handleFileChange}
                    />
                </div>
                <div className="settings-form-grid">
                    <label className="settings-field">
                        <span>{t('account.settings.displayName')}</span>
                        <input type="text" value={displayNameInput} onChange={(event) => setDisplayNameInput(event.target.value)} />
                    </label>
                    <label className="settings-field">
                        <span>{t('account.settings.emailAddress')}</span>
                        <input type="email" value={emailInput} readOnly />
                        <Link to="/account/security" className="settings-helper-link">
                            {t('account.settings.changeEmailInSecurity')}
                        </Link>
                    </label>
                </div>
                <div className="settings-card-footer">
                    <span className="settings-muted-link">{t('account.settings.keepSecure')}</span>
                    <button type="button" className="btn btn-primary settings-save-btn" onClick={handleSaveProfile} disabled={isSavingProfile}>
                        {isSavingProfile ? t('common.saving') : t('common.saveChanges')}
                    </button>
                </div>
            </div>

            <div className="card settings-card" data-testid="settings-preferences">
                <div className="settings-card-header">
                    <h3>{t('account.settings.notifications')}</h3>
                </div>
                <p className="settings-muted-link">
                    {t('account.settings.newsletterNote')}
                </p>
                <div className="settings-checkboxes">
                    <label className="settings-checkbox">
                        <input
                            type="checkbox"
                            checked={notifications.promotions}
                            onChange={(event) => setNotifications((prev) => ({ ...prev, promotions: event.target.checked }))}
                        />
                        {t('account.settings.newsletter')}
                    </label>
                    {/* Вложенная настройка, а не соседняя: она про одну из рассылок, и без самой
                        подписки смысла не имеет — поэтому при выключенной подписке недоступна. */}
                    <label
                        className={`settings-checkbox settings-checkbox--nested${notifications.promotions ? '' : ' settings-checkbox--locked'}`}
                        title={notifications.promotions ? undefined : t('account.settings.turnOnNewsletter')}
                    >
                        <input
                            type="checkbox"
                            checked={dealAlerts && notifications.promotions}
                            disabled={!notifications.promotions}
                            onChange={(event) => setDealAlerts(event.target.checked)}
                        />
                        {t('account.settings.priceDrops')}
                    </label>
                    <label className="settings-checkbox settings-checkbox--locked" title={t('account.settings.transactionalNote')}>
                        <input type="checkbox" checked disabled />
                        {t('account.settings.securityAlerts')}
                    </label>
                </div>
                <div className="settings-card-footer settings-card-footer--end">
                    <button
                        type="button"
                        className="btn btn-primary settings-save-btn"
                        onClick={handleSavePreferences}
                        disabled={isSavingPreferences}
                    >
                        {isSavingPreferences ? t('common.saving') : t('account.settings.savePreferences')}
                    </button>
                </div>
            </div>

            {/* Строка интеграции, как в списках у Notion и Stripe: логотип, название с одной строкой
                описания, справа — статус и одно действие. Статус после похода в бота перечитывается
                сам при возврате на вкладку. */}
            <div className="card settings-card settings-telegram" data-testid="settings-telegram">
                <div className="settings-telegram-row">
                    <span className="settings-telegram-icon" aria-hidden="true">
                        <FontAwesomeIcon icon={faTelegram} />
                    </span>
                    <div className="settings-telegram-text">
                        <h3>Telegram</h3>
                        <p>
                            {telegram?.linked
                                ? t('account.settings.telegramLinked')
                                : t('account.settings.telegramUnlinked')}
                        </p>
                    </div>
                    {telegram?.linked ? (
                        <div className="settings-telegram-side">
                            <span className="settings-telegram-user">
                                <span className="settings-telegram-avatar" aria-hidden="true">
                                    {(telegram.username ?? 'T').charAt(0).toUpperCase()}
                                </span>
                                {telegram.username ? `@${telegram.username}` : t('account.settings.linkedAccount')}
                            </span>
                            <span className="settings-telegram-badge settings-telegram-badge--on">
                                <span className="settings-telegram-dot" aria-hidden="true" />
                                {t('common.connected')}
                            </span>
                            <button
                                type="button"
                                className="settings-telegram-link"
                                onClick={() => setIsUnlinkModalOpen(true)}
                                disabled={isTelegramBusy}
                            >
                                {t('common.disconnect')}
                            </button>
                        </div>
                    ) : (
                        <div className="settings-telegram-side">
                            <span className="settings-telegram-badge">{t('common.notConnected')}</span>
                            <button
                                type="button"
                                className="btn btn-primary settings-telegram-btn"
                                aria-label={t('account.settings.connectTelegram')}
                                onClick={handleConnectTelegram}
                                disabled={isTelegramBusy || isTelegramUnavailable}
                            >
                                {isTelegramBusy ? t('common.working') : t('common.connect')}
                            </button>
                        </div>
                    )}
                </div>
                {isTelegramUnavailable && (
                    <p className="settings-telegram-note" role="alert">
                        {t('account.settings.telegramUnavailable')}
                    </p>
                )}
            </div>

            <div className="card settings-card" data-testid="settings-security-pointer">
                <div className="settings-card-header">
                    <h3>{t('account.settings.accountSecurity')}</h3>
                </div>
                <p className="settings-muted-link">
                    {t('account.settings.securityPointer')}
                </p>
                <div className="settings-pointer-actions">
                    <Link to="/account/security" className="btn btn-outline">{t('account.settings.openSecurity')}</Link>
                    <Link to="/account/billing" className="btn btn-outline">{t('account.settings.billingPrivacy')}</Link>
                </div>
            </div>

            <AvatarCropModal
                key={draftAvatarPreviewUrl ?? 'avatar-crop-empty'}
                isOpen={isAvatarModalOpen}
                imageSrc={draftAvatarPreviewUrl}
                isSaving={isSavingProfile}
                onClose={closeAvatarModal}
                onSave={handleAvatarDraftSave}
            />

            <ModalConfirm
                isOpen={isUnlinkModalOpen}
                title={t('account.settings.disconnectTitle')}
                description={t('account.settings.disconnectText')}
                confirmLabel={t('common.disconnect')}
                cancelLabel={t('common.cancel')}
                onConfirm={handleUnlinkTelegram}
                onCancel={() => setIsUnlinkModalOpen(false)}
            />

            <ModalConfirm
                isOpen={isRemoveModalOpen}
                title={t('account.settings.removeAvatarTitle')}
                description={t('account.settings.removeAvatarText')}
                confirmLabel={t('common.remove')}
                cancelLabel={t('common.cancel')}
                onConfirm={handleRemove}
                onCancel={() => setIsRemoveModalOpen(false)}
            />

        </AccountShell>
    );
};

export default AccountSettingsPage;
