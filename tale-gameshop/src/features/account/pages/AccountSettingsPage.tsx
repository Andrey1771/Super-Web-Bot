import React from 'react';
import {Link} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faArrowLeft, faArrowRight, faChevronRight} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import { useRecommendations } from '../../../hooks/use-recommendations';
import RecommendationsSection from '../../../components/recommendations/recommendations-section';
import './account-settings-page.css';

const AccountSettingsPage: React.FC = () => {
    const {
        items: recommendations,
        isLoading: isRecommendationsLoading,
        error: recommendationsError,
        reload: reloadRecommendations
    } = useRecommendations(6);

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
                        <input type="text" defaultValue="Alex R." />
                    </label>
                    <label className="settings-field">
                        <span>Email address</span>
                        <div className="settings-input-with-icon">
                            <input type="email" defaultValue="hohlov908@gmail.com" />
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
                    <a href="#" className="settings-link">
                        Delete avatar
                    </a>
                    <button type="button" className="btn btn-primary settings-save-btn">
                        Save changes
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
                                {item.game.imagePath ? (
                                    <img src={item.game.imagePath} alt={item.game.title} />
                                ) : (
                                    <div className="settings-recommendation-fallback" aria-hidden="true" />
                                )}
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
