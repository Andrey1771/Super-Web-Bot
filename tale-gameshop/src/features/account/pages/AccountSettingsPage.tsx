import React, {useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
    faArrowLeft,
    faArrowRight,
    faChevronRight
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import './account-settings-page.css';

const recommendations = [
    {id: 'rec-1', title: 'Dying Light 2', priceUsd: 19.99},
    {id: 'rec-2', title: 'Dark Souls III', priceUsd: 59.99},
    {id: 'rec-3', title: 'The Witcher 3', priceUsd: 29.99},
    {id: 'rec-4', title: 'God of War', priceUsd: 49.99}
];

const AccountSettingsPage: React.FC = () => {
    const [profile, setProfile] = useState({
        displayName: 'Alex R.',
        email: 'hohlov908@gmail.com',
        country: 'Ukraine'
    });
    const [preferences, setPreferences] = useState({
        language: 'English (EN)',
        currency: 'USD ($)',
        promotions: true,
        productNews: true,
        securityAlerts: true
    });
    const [privacy, setPrivacy] = useState({
        hideOwned: true
    });
    const [danger, setDanger] = useState({
        logoutAll: true
    });
    const [profileSaved, setProfileSaved] = useState(false);
    const [preferencesSaved, setPreferencesSaved] = useState(false);
    const [avatarRemoved, setAvatarRemoved] = useState(false);

    useEffect(() => {
        const storedProfile = localStorage.getItem('account-settings-profile');
        const storedPreferences = localStorage.getItem('account-settings-preferences');
        const storedPrivacy = localStorage.getItem('account-settings-privacy');
        const storedDanger = localStorage.getItem('account-settings-danger');

        if (storedProfile) {
            setProfile(JSON.parse(storedProfile));
        }

        if (storedPreferences) {
            const parsedPreferences = JSON.parse(storedPreferences);
            setPreferences(parsedPreferences);
            document.documentElement.lang = parsedPreferences.language.includes('English') ? 'en' : 'uk';
            document.body.dataset.currency = parsedPreferences.currency;
        }

        if (storedPrivacy) {
            setPrivacy(JSON.parse(storedPrivacy));
        }

        if (storedDanger) {
            setDanger(JSON.parse(storedDanger));
        }
    }, []);

    const hasProfileChanges = useMemo(() => {
        const storedProfile = localStorage.getItem('account-settings-profile');
        return storedProfile ? storedProfile !== JSON.stringify(profile) : true;
    }, [profile]);

    const hasPreferenceChanges = useMemo(() => {
        const storedPreferences = localStorage.getItem('account-settings-preferences');
        return storedPreferences ? storedPreferences !== JSON.stringify(preferences) : true;
    }, [preferences]);

    const handleProfileSave = () => {
        localStorage.setItem('account-settings-profile', JSON.stringify(profile));
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 2000);
    };

    const handlePreferencesSave = () => {
        localStorage.setItem('account-settings-preferences', JSON.stringify(preferences));
        document.documentElement.lang = preferences.language.includes('English') ? 'en' : 'uk';
        document.body.dataset.currency = preferences.currency;
        setPreferencesSaved(true);
        setTimeout(() => setPreferencesSaved(false), 2000);
    };

    const handlePrivacyToggle = (value: boolean) => {
        const nextPrivacy = {hideOwned: value};
        setPrivacy(nextPrivacy);
        localStorage.setItem('account-settings-privacy', JSON.stringify(nextPrivacy));
    };

    const handleDangerToggle = (value: boolean) => {
        const nextDanger = {logoutAll: value};
        setDanger(nextDanger);
        localStorage.setItem('account-settings-danger', JSON.stringify(nextDanger));
    };

    const handleAvatarRemove = () => {
        setAvatarRemoved(true);
        localStorage.setItem('account-settings-avatar', 'removed');
    };

    const formattedRecommendations = useMemo(() => {
        const currency = preferences.currency;
        const formatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.includes('EUR') ? 'EUR' : currency.includes('UAH') ? 'UAH' : 'USD'
        });

        const multiplier = currency.includes('EUR') ? 0.92 : currency.includes('UAH') ? 39.5 : 1;

        return recommendations.map((item) => ({
            ...item,
            displayPrice: formatter.format(item.priceUsd * multiplier)
        }));
    }, [preferences.currency]);

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
                <div className="settings-form-grid">
                    <label className="settings-field">
                        <span>Display name</span>
                        <input
                            className="settings-input"
                            type="text"
                            value={profile.displayName}
                            onChange={(event) => setProfile((prev) => ({
                                ...prev,
                                displayName: event.target.value
                            }))}
                        />
                    </label>
                    <label className="settings-field">
                        <span>Email address</span>
                        <div className="settings-input-with-icon">
                            <input
                                className="settings-input"
                                type="email"
                                value={profile.email}
                                onChange={(event) => setProfile((prev) => ({
                                    ...prev,
                                    email: event.target.value
                                }))}
                            />
                            <FontAwesomeIcon icon={faChevronRight} />
                        </div>
                    </label>
                    <label className="settings-field">
                        <span>Country/Region</span>
                        <div className="settings-select-with-flag">
                            <span className="settings-flag" aria-hidden="true">🇺🇦</span>
                            <select
                                className="settings-select"
                                value={profile.country}
                                onChange={(event) => setProfile((prev) => ({
                                    ...prev,
                                    country: event.target.value
                                }))}
                            >
                                <option>Ukraine</option>
                                <option>Poland</option>
                                <option>Germany</option>
                            </select>
                        </div>
                    </label>
                </div>
                <div className="settings-card-footer">
                    <button type="button" className="settings-link-btn" onClick={handleAvatarRemove}>
                        {avatarRemoved ? 'Avatar removed' : 'Delete avatar'}
                    </button>
                    <div className="settings-save-row">
                        {profileSaved && <span className="settings-status">Saved</span>}
                        <button
                            type="button"
                            className="btn btn-primary settings-save-btn"
                            onClick={handleProfileSave}
                            disabled={!hasProfileChanges}
                        >
                        Save changes
                        </button>
                    </div>
                </div>
            </div>

            <div className="card settings-card" data-testid="settings-preferences">
                <div className="settings-card-header">
                    <h3>Preferences</h3>
                </div>
                <div className="settings-preferences-grid">
                    <label className="settings-field">
                        <span>Language</span>
                        <select
                            className="settings-select"
                            value={preferences.language}
                            onChange={(event) => setPreferences((prev) => ({
                                ...prev,
                                language: event.target.value
                            }))}
                        >
                            <option>English (EN)</option>
                            <option>Spanish (ES)</option>
                            <option>Ukrainian (UA)</option>
                        </select>
                    </label>
                    <label className="settings-field">
                        <span>Currency</span>
                        <select
                            className="settings-select"
                            value={preferences.currency}
                            onChange={(event) => setPreferences((prev) => ({
                                ...prev,
                                currency: event.target.value
                            }))}
                        >
                            <option>USD ($)</option>
                            <option>EUR (€)</option>
                            <option>UAH (₴)</option>
                        </select>
                    </label>
                </div>
                <div className="settings-checkboxes">
                    <label className="settings-checkbox">
                        <input
                            type="checkbox"
                            checked={preferences.promotions}
                            onChange={(event) => setPreferences((prev) => ({
                                ...prev,
                                promotions: event.target.checked
                            }))}
                        />
                        Receive promotions and special offers
                    </label>
                    <label className="settings-checkbox">
                        <input
                            type="checkbox"
                            checked={preferences.productNews}
                            onChange={(event) => setPreferences((prev) => ({
                                ...prev,
                                productNews: event.target.checked
                            }))}
                        />
                        Receive store and product news
                    </label>
                    <label className="settings-checkbox">
                        <input
                            type="checkbox"
                            checked={preferences.securityAlerts}
                            onChange={(event) => setPreferences((prev) => ({
                                ...prev,
                                securityAlerts: event.target.checked
                            }))}
                        />
                        Receive security alerts (important)
                    </label>
                </div>
                <div className="settings-card-footer settings-card-footer--end">
                    <div className="settings-save-row">
                        {preferencesSaved && <span className="settings-status">Saved</span>}
                        <button
                            type="button"
                            className="btn btn-primary settings-save-btn"
                            onClick={handlePreferencesSave}
                            disabled={!hasPreferenceChanges}
                        >
                            Save preferences
                        </button>
                    </div>
                </div>
            </div>

            <div className="settings-split-grid">
                <div className="card settings-card" data-testid="settings-privacy">
                    <div className="settings-card-header">
                        <h3>Privacy</h3>
                    </div>
                    <div className="settings-privacy-row">
                        <span>Hide owned games in profile</span>
                        <label className="settings-switch">
                            <input
                                type="checkbox"
                                checked={privacy.hideOwned}
                                onChange={(event) => handlePrivacyToggle(event.target.checked)}
                            />
                            <span className="settings-switch-slider" aria-hidden="true" />
                        </label>
                    </div>
                    <button type="button" className="settings-muted-link">
                        Data will be grey
                    </button>
                </div>

                <div className="card settings-card" data-testid="settings-danger">
                    <div className="settings-card-header">
                        <h3>Danger zone</h3>
                    </div>
                    <label className="settings-checkbox">
                        <input
                            type="checkbox"
                            checked={danger.logoutAll}
                            onChange={(event) => handleDangerToggle(event.target.checked)}
                        />
                        Logout all sessions
                    </label>
                    <button type="button" className="btn btn-outline settings-danger-btn">
                        Delete your account
                    </button>
                </div>
            </div>

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
                <div className="settings-recommendations-list">
                    {formattedRecommendations.map((item) => (
                        <div key={item.id} className="card settings-recommendation-card">
                            <div className="settings-recommendation-media" aria-hidden="true" />
                            <div className="settings-recommendation-body">
                                <strong>{item.title}</strong>
                                <span className="settings-recommendation-price">{item.displayPrice}</span>
                            </div>
                            <button type="button" className="btn btn-primary settings-recommendation-btn">
                                Add to cart
                            </button>
                        </div>
                    ))}
                </div>
            </section>
        </AccountShell>
    );
};

export default AccountSettingsPage;
