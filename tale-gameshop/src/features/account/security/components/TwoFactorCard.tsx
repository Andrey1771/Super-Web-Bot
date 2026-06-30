import React from 'react';

type TwoFactorCardProps = {
    isEnabled: boolean;
    backupCodesGenerated: boolean;
    isLoading: boolean;
    onPrimaryAction: () => void;
    onDisable: () => void;
};

const TwoFactorCard: React.FC<TwoFactorCardProps> = ({isEnabled, backupCodesGenerated, isLoading, onPrimaryAction, onDisable}) => {
    const statusLabel = isLoading ? 'Loading' : isEnabled ? 'Enabled' : 'Disabled';

    return (
        <div className="card security-card" data-testid="security-2fa-card">
            <div className="security-card-header">
                <h3>Two-Factor Authentication</h3>
                <span className={`security-status-pill ${isEnabled ? 'is-on' : 'is-off'}`}>{statusLabel}</span>
            </div>
            <div className="security-card-actions">
                {isEnabled ? (
                    <>
                        <button type="button" className="btn btn-primary security-action-btn" onClick={onDisable} disabled={isLoading}>
                            Disable 2FA
                        </button>
                        <button type="button" className="security-link" onClick={onPrimaryAction} disabled={isLoading}>
                            Re-configure
                        </button>
                    </>
                ) : (
                    <button type="button" className="btn btn-primary security-action-btn" onClick={onPrimaryAction} disabled={isLoading}>
                        Enable 2FA
                    </button>
                )}
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
