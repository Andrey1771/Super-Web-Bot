import React from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faChevronDown} from '@fortawesome/free-solid-svg-icons';

type TwoFactorCardProps = {
    isEnabled: boolean;
    backupCodesGenerated: boolean;
    isLoading: boolean;
    onPrimaryAction: () => void;
};

const TwoFactorCard: React.FC<TwoFactorCardProps> = ({isEnabled, backupCodesGenerated, isLoading, onPrimaryAction}) => {
    const statusLabel = isLoading ? 'Loading' : isEnabled ? 'Enabled' : 'Disabled';
    const primaryLabel = isEnabled ? 'Manage 2FA' : 'Enable 2FA';

    return (
        <div className="card security-card" data-testid="security-2fa-card">
            <div className="security-card-header">
                <h3>Two-Factor Authentication</h3>
                <span className="security-status-btn">
                    {statusLabel}
                    <FontAwesomeIcon icon={faChevronDown} />
                </span>
            </div>
            <div className="security-card-actions">
                <button type="button" className="btn btn-primary security-action-btn" onClick={onPrimaryAction} disabled={isLoading}>
                    {primaryLabel}
                </button>
                <a className="security-link" href="https://www.keycloak.org/docs/latest/server_admin/#_two-factor-authentication" target="_blank" rel="noreferrer">
                    Learn how it works
                </a>
            </div>
            <div className="security-divider" aria-hidden="true" />
            <p className="security-muted">
                Backup codes: {backupCodesGenerated ? 'generated' : 'not generated'}
            </p>
        </div>
    );
};

export default TwoFactorCard;
