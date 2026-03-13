import React, { useEffect, useMemo, useRef, useState } from 'react';
import {Link} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faArrowLeft, faArrowRight, faChevronRight, faPen} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import AvatarCropModal from '../components/AvatarCropModal';
import { useRecommendations } from '../../../hooks/use-recommendations';
import RecommendationsSection from '../../../components/recommendations/recommendations-section';
import SafeGameImage from '../../../components/common/SafeGameImage';
import ModalConfirm from '../../../components/ui/ModalConfirm';
import { useToast } from '../../../components/ui/ToastProvider';
import { fetchAccountProfile, saveAccountProfile } from '../../../api/accountApi';
import { useAccountProfile } from '../context/AccountProfileContext';
import './account-settings-page.css';

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
    const {
        items: recommendations,
        isLoading: isRecommendationsLoading,
        error: recommendationsError,
        reload: reloadRecommendations
    } = useRecommendations(6);

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

    const handleRemove = () => {
        setPendingAvatarRemoval(true);
        clearAvatarDraft();
        setIsRemoveModalOpen(false);
        addToast('Avatar will be removed after Save changes.', 'info');
    };

    const avatarDisplayUrl = draftAvatarPreviewUrl ?? (pendingAvatarRemoval ? null : savedAvatarUrl);

    return (
        <AccountShell
            title="My account"
            sectionLabel="Settings"
            subtitle={<h2 className="settings-title">Settings</h2>}
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
                        <div className="settings-input-with-icon">
                            <input type="email" value={emailInput} onChange={(event) => setEmailInput(event.target.value)} />
                            <FontAwesomeIcon icon={faChevronRight} />
                        </div>
                    </label>
                    <label className="settings-field">
                        <span>Country/Region</span>
                        <div className="settings-select-with-flag">
                            <span className="settings-flag" aria-hidden="true">
                                🇺🇦
                            </span>
                            <select defaultValue="Ukraine">
                                <option>Ukraine</option>
                                <option>Poland</option>
                                <option>Germany</option>
                            </select>
                        </div>
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
                    <h3>Preferences</h3>
                </div>
                <div className="settings-preferences-grid">
                    <label className="settings-field">
                        <span>Language</span>
                        <select defaultValue="English (EN)">
                            <option>English (EN)</option>
                            <option>Українська (UA)</option>
                            <option>Deutsch (DE)</option>
                        </select>
                    </label>
                    <label className="settings-field">
                        <span>Currency</span>
                        <select defaultValue="USD ($)">
                            <option>USD ($)</option>
                            <option>EUR (€)</option>
                            <option>UAH (₴)</option>
                        </select>
                    </label>
                </div>
                <div className="settings-checkboxes">
                    <label className="settings-checkbox">
                        <input type="checkbox" defaultChecked />
                        Receive promotions and special offers
                    </label>
                    <label className="settings-checkbox">
                        <input type="checkbox" defaultChecked />
                        Receive store and product news
                    </label>
                    <label className="settings-checkbox">
                        <input type="checkbox" defaultChecked />
                        Receive security alerts (important)
                    </label>
                </div>
                <div className="settings-card-footer settings-card-footer--end">
                    <button type="button" className="btn btn-primary settings-save-btn">
                        Save preferences
                    </button>
                </div>
            </div>

            <div className="settings-lower-grid">
                <div className="card settings-card" data-testid="settings-privacy">
                    <div className="settings-card-header">
                        <h3>Privacy</h3>
                    </div>
                    <div className="settings-privacy-row">
                        <span>Hide owned games in profile</span>
                        <label className="settings-switch">
                            <input type="checkbox" defaultChecked />
                            <span className="settings-switch-slider" aria-hidden="true" />
                        </label>
                    </div>
                    <span className="settings-muted-link">Data will be grey</span>
                </div>

                <div className="card settings-card" data-testid="settings-danger">
                    <div className="settings-card-header">
                        <h3>Danger zone</h3>
                    </div>
                    <label className="settings-checkbox settings-checkbox--danger">
                        <input type="checkbox" />
                        Logout all sessions
                    </label>
                    <button type="button" className="btn btn-outline settings-danger-btn">
                        Delete your account
                    </button>
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

            <section className="settings-recommendations" data-testid="settings-recommendations">
                <div className="settings-recommendations-header">
                    <h3>Recommendations based on your wishlist</h3>
                    <div className="settings-recommendations-arrows">
                        <button type="button" className="btn btn-outline settings-arrow-btn" aria-label="Scroll left">
                            <FontAwesomeIcon icon={faArrowLeft} />
                        </button>
                        <button type="button" className="btn btn-outline settings-arrow-btn" aria-label="Scroll right">
                            <FontAwesomeIcon icon={faArrowRight} />
                        </button>
                    </div>
                </div>
                <RecommendationsSection
                    items={recommendations}
                    isLoading={isRecommendationsLoading}
                    error={recommendationsError}
                    onRetry={reloadRecommendations}
                    emptyMessage="Add games to your wishlist or view a few games to get recommendations."
                    listClassName="settings-recommendations-list"
                    stateClassName="settings-recommendations-state"
                    renderSkeleton={(index) => (
                        <div key={`rec-skeleton-${index}`} className="card settings-recommendation-card is-skeleton" />
                    )}
                    renderItem={(item) => (
                        <div key={item.game.id ?? item.game.title} className="card settings-recommendation-card">
                            <div className="settings-recommendation-media">
                                <SafeGameImage src={item.game.imagePath} gameTitle={item.game.title} />
                            </div>
                            <div className="settings-recommendation-body">
                                <strong>{item.game.title}</strong>
                                <span className="settings-recommendation-price">
                                    ${Number(item.game.price).toFixed(2)}
                                </span>
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary settings-recommendation-btn"
                                disabled={!item.game.id}
                            >
                                Add to cart
                            </button>
                        </div>
                    )}
                />
            </section>
        </AccountShell>
    );
};

export default AccountSettingsPage;
