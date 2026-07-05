import React, { useEffect, useMemo, useRef, useState } from 'react';
import {Link} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faPen} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import AvatarCropModal from '../components/AvatarCropModal';
import ModalConfirm from '../../../components/ui/ModalConfirm';
import { useToast } from '../../../components/ui/ToastProvider';
import { fetchAccountProfile, saveAccountProfile } from '../../../api/accountApi';
import { useAccountProfile } from '../context/AccountProfileContext';
import './account-settings-page.css';

type NotificationPrefs = {
    promotions: boolean;
    productNews: boolean;
    securityAlerts: boolean;
};

const NOTIFICATIONS_STORAGE_KEY = 'settings_notifications';
const defaultNotifications: NotificationPrefs = { promotions: true, productNews: true, securityAlerts: true };

const readNotifications = (): NotificationPrefs => {
    try {
        const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
        return raw ? { ...defaultNotifications, ...(JSON.parse(raw) as Partial<NotificationPrefs>) } : defaultNotifications;
    } catch {
        return defaultNotifications;
    }
};

const AccountSettingsPage: React.FC = () => {
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
    const [displayNameInput, setDisplayNameInput] = useState(profile?.displayName ?? 'User');
    const [emailInput, setEmailInput] = useState(profile?.email ?? '');
    const [notifications, setNotifications] = useState<NotificationPrefs>(readNotifications);
    const [isSavingPreferences, setIsSavingPreferences] = useState(false);

    const displayName = profile?.displayName ?? 'User';

    useEffect(() => {
        if (isAvatarModalOpen) {
            return;
        }

        setSavedAvatarUrl(profile?.avatarUrl ?? null);
        setDisplayNameInput(profile?.displayName ?? 'User');
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
            addToast('File too large (max 2MB).', 'error');
            return;
        }
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            addToast('Unsupported format. Use PNG, JPG, or WebP.', 'error');
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
            addToast('Profile updated.', 'success');
        } catch (error) {
            console.error(error);
            addToast('Profile save failed. Please try again.', 'error');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleSavePreferences = () => {
        setIsSavingPreferences(true);
        try {
            localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
            addToast('Notification preferences saved.', 'success');
        } finally {
            setIsSavingPreferences(false);
        }
    };

    const handleRemove = () => {
        setPendingAvatarRemoval(true);
        clearAvatarDraft();
        setIsRemoveModalOpen(false);
        addToast('Avatar will be removed after Save changes.', 'info');
    };

    const avatarDisplayUrl = draftAvatarPreviewUrl ?? (pendingAvatarRemoval ? null : savedAvatarUrl);

    return (
        <AccountShell
            title="Settings"
            sectionLabel="Settings"
            subtitle="Manage your profile and preferences."
        >
            <div className="card settings-card" data-testid="settings-profile">
                <div className="settings-card-header">
                    <h3>Profile</h3>
                </div>
                <div className="settings-avatar-block">
                    <button type="button" className="settings-avatar" onClick={openFileDialog}>
                        {avatarDisplayUrl ? (
                            <img src={avatarDisplayUrl} alt={`${displayName} avatar`} />
                        ) : (
                            <span>{initials}</span>
                        )}
                        <span className="settings-avatar-edit" aria-hidden="true">
                            <FontAwesomeIcon icon={faPen} />
                        </span>
                    </button>
                    <div className="settings-avatar-actions">
                        <div>
                            <strong>Avatar</strong>
                            <p className="settings-avatar-hint">PNG/JPG/WebP • up to 2 MB • square recommended</p>
                        </div>
                        <div className="settings-avatar-buttons">
                            <button type="button" className="btn btn-primary" onClick={openFileDialog} disabled={isSavingProfile}>
                                Upload photo
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => setIsRemoveModalOpen(true)}
                                disabled={!savedAvatarUrl || isSavingProfile || pendingAvatarRemoval}
                            >
                                Remove
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
                        <span>Display name</span>
                        <input type="text" value={displayNameInput} onChange={(event) => setDisplayNameInput(event.target.value)} />
                    </label>
                    <label className="settings-field">
                        <span>Email address</span>
                        <input type="email" value={emailInput} readOnly />
                        <Link to="/account/security" className="settings-helper-link">
                            Change email in Security
                        </Link>
                    </label>
                </div>
                <div className="settings-card-footer">
                    <span className="settings-muted-link">Keep your profile secure with a fresh avatar.</span>
                    <button type="button" className="btn btn-primary settings-save-btn" onClick={handleSaveProfile} disabled={isSavingProfile}>
                        {isSavingProfile ? 'Saving...' : 'Save changes'}
                    </button>
                </div>
            </div>

            <div className="card settings-card" data-testid="settings-preferences">
                <div className="settings-card-header">
                    <h3>Notifications</h3>
                </div>
                <p className="settings-muted-link">Choose what we email you about. Saved on this device.</p>
                <div className="settings-checkboxes">
                    <label className="settings-checkbox">
                        <input
                            type="checkbox"
                            checked={notifications.promotions}
                            onChange={(event) => setNotifications((prev) => ({ ...prev, promotions: event.target.checked }))}
                        />
                        Receive promotions and special offers
                    </label>
                    <label className="settings-checkbox">
                        <input
                            type="checkbox"
                            checked={notifications.productNews}
                            onChange={(event) => setNotifications((prev) => ({ ...prev, productNews: event.target.checked }))}
                        />
                        Receive store and product news
                    </label>
                    <label className="settings-checkbox">
                        <input
                            type="checkbox"
                            checked={notifications.securityAlerts}
                            onChange={(event) => setNotifications((prev) => ({ ...prev, securityAlerts: event.target.checked }))}
                        />
                        Receive security alerts (important)
                    </label>
                </div>
                <div className="settings-card-footer settings-card-footer--end">
                    <button
                        type="button"
                        className="btn btn-primary settings-save-btn"
                        onClick={handleSavePreferences}
                        disabled={isSavingPreferences}
                    >
                        {isSavingPreferences ? 'Saving...' : 'Save preferences'}
                    </button>
                </div>
            </div>

            <div className="card settings-card" data-testid="settings-security-pointer">
                <div className="settings-card-header">
                    <h3>Account &amp; security</h3>
                </div>
                <p className="settings-muted-link">
                    Password, two-factor authentication, active sessions and account deletion are managed in
                    Security. Payment methods and profile privacy live in Billing.
                </p>
                <div className="settings-pointer-actions">
                    <Link to="/account/security" className="btn btn-outline">Open Security</Link>
                    <Link to="/account/billing" className="btn btn-outline">Billing &amp; privacy</Link>
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
                isOpen={isRemoveModalOpen}
                title="Remove avatar?"
                description="This will remove your current avatar and return to initials."
                confirmLabel="Remove"
                cancelLabel="Cancel"
                onConfirm={handleRemove}
                onCancel={() => setIsRemoveModalOpen(false)}
            />

        </AccountShell>
    );
};

export default AccountSettingsPage;
