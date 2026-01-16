import React from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
    faChevronDown,
    faChevronRight,
    faEye,
    faShieldHalved
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import './account-security-page.css';

const AccountSecurityPage: React.FC = () => {
    return (
        <AccountShell
            title="Security"
            sectionLabel="Security"
            subtitle="Manage password, email verification and 2FA."
            actions={<></>}
            headerTestId="security-header"
        >
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
        </AccountShell>
    );
};

export default AccountSecurityPage;
