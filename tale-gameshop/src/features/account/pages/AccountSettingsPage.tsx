import React from 'react';
import {Link} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faChevronRight, faArrowLeft, faArrowRight} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import './account-settings-page.css';

const preferenceOptions = [
    'Receive promotions and special offers',
    'Receive store and product news',
    'Receive security alerts (important)'
];

const recommendations = [
    {id: 'rec-1', title: 'Dying Light 2', price: '$19.99'},
    {id: 'rec-2', title: 'Dark Souls III', price: '$59.99'},
    {id: 'rec-3', title: 'The Witcher 3', price: '$29.99'},
    {id: 'rec-4', title: 'God of War', price: '$49.99'}
];

const AccountSettingsPage: React.FC = () => {
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
            <section className="card settings-card" data-testid="settings-profile">
                <div className="settings-card-header">
                    <h3>Profile</h3>
                </div>
                <div className="settings-form-grid">
                    <label className="settings-field">
                        <span>Display name</span>
                        <input className="settings-input" type="text" defaultValue="Alex R." />
                    </label>
                    <label className="settings-field">
                        <span>Email address</span>
                        <div className="settings-input-with-icon">
                            <input className="settings-input" type="email" defaultValue="hohlov908@gmail.com" />
                            <FontAwesomeIcon icon={faChevronRight} />
                        </div>
                    </label>
                    <label className="settings-field">
                        <span>Country/Region</span>
                        <div className="settings-select-with-flag">
                            <span className="settings-flag" aria-hidden="true">
                                🇺🇦
                            </span>
                            <select className="settings-select" defaultValue="Ukraine">
                                <option>Ukraine</option>
                                <option>Poland</option>
                                <option>Germany</option>
                                <option>United States</option>
                            </select>
                        </div>
                    </label>
                </div>
                <div className="settings-card-footer">
                    <button type="button" className="settings-link-btn">
                        Delete avatar
                    </button>
                    <button type="button" className="btn btn-primary settings-save-btn" disabled>
                        Save changes
                    </button>
                </div>
            </section>

            <section className="card settings-card" data-testid="settings-preferences">
                <div className="settings-card-header">
                    <h3>Preferences</h3>
                </div>
                <div className="settings-preferences-grid">
                    <label className="settings-field">
                        <span>Language</span>
                        <select className="settings-select" defaultValue="English (EN)">
                            <option>English (EN)</option>
                            <option>Ukrainian (UA)</option>
                            <option>German (DE)</option>
                        </select>
                    </label>
                    <label className="settings-field">
                        <span>Currency</span>
                        <select className="settings-select" defaultValue="USD ($)">
                            <option>USD ($)</option>
                            <option>EUR (€)</option>
                            <option>UAH (₴)</option>
                        </select>
                    </label>
                </div>
                <div className="settings-checkbox-list">
                    {preferenceOptions.map((label) => (
                        <label key={label} className="settings-checkbox">
                            <input type="checkbox" defaultChecked />
                            <span>{label}</span>
                        </label>
                    ))}
                </div>
                <div className="settings-preferences-footer">
                    <button type="button" className="btn btn-primary settings-preferences-save">
                        Save preferences
                    </button>
                </div>
            </section>

            <div className="settings-lower-grid">
                <section className="card settings-card" data-testid="settings-privacy">
                    <div className="settings-card-header">
                        <h3>Privacy</h3>
                    </div>
                    <div className="settings-privacy-row">
                        <span>Hide owned games in profile</span>
                        <label className="settings-switch">
                            <input type="checkbox" defaultChecked />
                            <span className="settings-switch-track" aria-hidden="true" />
                        </label>
                    </div>
                    <button type="button" className="settings-muted-link">
                        Data will be grey
                    </button>
                </section>

                <section className="card settings-card" data-testid="settings-danger">
                    <div className="settings-card-header">
                        <h3>Danger zone</h3>
                    </div>
                    <label className="settings-checkbox settings-checkbox-inline">
                        <input type="checkbox" defaultChecked />
                        <span>Logout all sessions</span>
                    </label>
                    <button type="button" className="btn btn-outline settings-danger-btn">
                        Delete your account
                    </button>
                </section>
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
                    {recommendations.map((item) => (
                        <div key={item.id} className="card settings-recommendation-card">
                            <div className="settings-recommendation-media" aria-hidden="true" />
                            <div className="settings-recommendation-body">
                                <strong>{item.title}</strong>
                                <span className="settings-recommendation-price">{item.price}</span>
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
