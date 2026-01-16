import React from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
    faChevronDown,
    faChevronRight,
    faEye,
    faShieldHalved,
    faShieldVirus,
    faGlobe,
    faChevronLeft
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import './account-security-page.css';

const SecurityTopSection: React.FC = () => {
    return (
        <>
            <section className="card security-alert" data-testid="security-alert">
                <div className="security-alert-icon" aria-hidden="true">
                    <FontAwesomeIcon icon={faShieldHalved} />
                </div>
                <div className="security-alert-content">
                    <h2>Your account is not fully protected</h2>
                    <p>Enable two-factor authentication (2FA) to enhance the security of your account.</p>
                </div>
                <button type="button" className="btn btn-primary security-alert-btn">
                    Set up 2FA
                </button>
            </section>

            <div className="security-grid">
                <div className="card security-card" data-testid="security-2fa-card">
                    <div className="security-card-header">
                        <h3>Two-Factor Authentication</h3>
                        <button type="button" className="security-status-btn" disabled>
                            Disabled
                            <FontAwesomeIcon icon={faChevronDown} />
                        </button>
                    </div>
                    <div className="security-card-actions">
                        <button type="button" className="btn btn-primary security-action-btn">
                            Enable 2FA
                        </button>
                        <a href="#" className="security-link">
                            Learn how it works
                        </a>
                    </div>
                    <div className="security-divider" aria-hidden="true" />
                    <p className="security-muted">Backup codes: not generated</p>
                </div>

                <div className="card security-card" data-testid="security-email-card">
                    <div className="security-card-header">
                        <h3>Email verification</h3>
                        <span className="security-status-pill">
                            Not verified
                            <FontAwesomeIcon icon={faChevronRight} />
                        </span>
                    </div>
                    <p className="security-muted">Verify email to secure purchases and recovery.</p>
                    <div className="security-email-actions">
                        <button type="button" className="btn btn-outline security-secondary-btn">
                            Resend verification email
                        </button>
                        <button type="button" className="btn btn-outline security-secondary-btn">
                            Change email
                            <FontAwesomeIcon icon={faChevronRight} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="card security-password" data-testid="security-password-card">
                <div className="security-password-grid">
                    <div className="security-password-form">
                        <h3>Password</h3>
                        <label className="security-field">
                            <span>Current password</span>
                            <div className="security-input">
                                <input type="password" placeholder="••••••••" />
                                <button type="button" className="security-input-icon" disabled aria-hidden="true">
                                    <FontAwesomeIcon icon={faEye} />
                                </button>
                            </div>
                        </label>
                        <label className="security-field">
                            <span>New password</span>
                            <div className="security-input">
                                <input type="password" placeholder="••••••••" />
                                <button type="button" className="security-input-icon" disabled aria-hidden="true">
                                    <FontAwesomeIcon icon={faEye} />
                                </button>
                            </div>
                        </label>
                        <label className="security-field">
                            <span>Confirm new password</span>
                            <div className="security-input">
                                <input type="password" placeholder="••••••••" />
                                <button type="button" className="security-input-icon" disabled aria-hidden="true">
                                    <FontAwesomeIcon icon={faEye} />
                                </button>
                            </div>
                        </label>
                        <button type="button" className="btn btn-primary security-update-btn">
                            Update password
                        </button>
                    </div>

                    <div className="security-password-info">
                        <div className="security-forgot-row">
                            <span>Forgot password?</span>
                            <button type="button" className="security-inline-link">
                                Reset
                                <FontAwesomeIcon icon={faChevronRight} />
                            </button>
                        </div>
                        <div className="security-info-card">
                            <div>
                                <h4>Password</h4>
                                <p>Your password was updated over 6 months ago.</p>
                                <p>For your safety, updating your password regularly is recommended.</p>
                            </div>
                            <button type="button" className="btn btn-outline security-secondary-btn">
                                Reset
                                <FontAwesomeIcon icon={faChevronRight} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

const SecurityBottomSection: React.FC = () => {
    const recommendations = [
        {id: 'rec-1', title: 'Dying Light 2', price: '$19.99'},
        {id: 'rec-2', title: 'Dark Souls', price: '$59.99'},
        {id: 'rec-3', title: 'The Witcher 3', price: '$59.99'},
        {id: 'rec-4', title: 'Slac', price: '$29.99'},
        {id: 'rec-5', title: 'God of War', price: '$49.99'},
        {id: 'rec-6', title: 'Hades', price: '$49.99'}
    ];

    return (
        <>
            <div className="security-bottom-grid">
                <div className="security-section" data-testid="security-sessions">
                    <h3>Active sessions</h3>
                    <div className="card security-sessions-card">
                        <div className="security-session-row">
                            <div className="security-session-icon" aria-hidden="true">
                                <FontAwesomeIcon icon={faShieldVirus} />
                            </div>
                            <div className="security-session-details">
                                <strong>Firefox on Windows</strong>
                                <span>Kyiv - 11 hours ago - IP 123.345.67.89</span>
                            </div>
                            <button type="button" className="btn btn-outline security-secondary-btn">
                                Log out
                                <FontAwesomeIcon icon={faChevronRight} />
                            </button>
                        </div>
                        <div className="security-session-row">
                            <div className="security-session-icon" aria-hidden="true">
                                <FontAwesomeIcon icon={faGlobe} />
                            </div>
                            <div className="security-session-details">
                                <strong>Chrome on Windows</strong>
                                <span>United States - Yesterday at 21:12 - IP 34.123.45.67</span>
                            </div>
                            <button type="button" className="btn btn-outline security-secondary-btn">
                                Log out
                                <FontAwesomeIcon icon={faChevronRight} />
                            </button>
                        </div>
                        <button type="button" className="btn btn-outline security-logout-all">
                            Log out all sessions
                        </button>
                    </div>
                </div>

                <div className="security-section" data-testid="security-danger">
                    <h3>Danger zone</h3>
                    <div className="card security-danger-card">
                        <div className="security-danger-actions">
                            <button type="button" className="btn btn-outline security-danger-btn">
                                Delete account
                            </button>
                            <button type="button" className="btn btn-outline security-secondary-btn">
                                Download security report
                            </button>
                        </div>
                        <div className="security-danger-text">
                            <p>Permanently delete your account and data.</p>
                            <p>Download a copy of your account security report for your records.</p>
                            <p>Proceed with caution.</p>
                        </div>
                    </div>
                </div>
            </div>

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
                <div className="security-recommendations-list">
                    {recommendations.map((item) => (
                        <div key={item.id} className="card security-recommendation-card">
                            <div className="security-recommendation-media" aria-hidden="true" />
                            <div className="security-recommendation-body">
                                <strong>{item.title}</strong>
                                <span className="security-recommendation-price">{item.price}</span>
                            </div>
                            <button type="button" className="btn btn-primary security-recommendation-btn">
                                Add to cart
                            </button>
                        </div>
                    ))}
                </div>
            </section>
        </>
    );
};

const AccountSecurityPage: React.FC = () => {
    return (
        <AccountShell
            title="Security"
            sectionLabel="Security"
            subtitle="Manage password, email verification and 2FA."
            actions={<></>}
            headerTestId="security-header"
        >
            <SecurityTopSection />
            <SecurityBottomSection />
        </AccountShell>
    );
};

export default AccountSecurityPage;
