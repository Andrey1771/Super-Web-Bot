import React from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faChevronRight} from '@fortawesome/free-solid-svg-icons';

type EmailVerificationCardProps = {
    emailVerified: boolean;
    isLoading: boolean;
    onResend: () => void;
    onChangeEmail: () => void;
};

const EmailVerificationCard: React.FC<EmailVerificationCardProps> = ({
    emailVerified,
    isLoading,
    onResend,
    onChangeEmail
}) => {
    return (
        <div className="card security-card" data-testid="security-email-card">
            <div className="security-card-header">
                <h3>Email verification</h3>
                <span className="security-status-pill">
                    {emailVerified ? 'Verified' : 'Not verified'}
                    <FontAwesomeIcon icon={faChevronRight} />
                </span>
            </div>
            <p className="security-muted">Verify email to secure purchases and recovery.</p>
            <div className="security-email-actions">
                <button
                    type="button"
                    className="btn btn-outline security-secondary-btn"
                    onClick={onResend}
                    disabled={isLoading || emailVerified}
                >
                    Resend verification email
                </button>
                <button type="button" className="btn btn-outline security-secondary-btn" onClick={onChangeEmail}>
                    Change email
                    <FontAwesomeIcon icon={faChevronRight} />
                </button>
            </div>
        </div>
    );
};

export default EmailVerificationCard;
