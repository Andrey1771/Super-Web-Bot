import React from 'react';
import {Link} from 'react-router-dom';

type TwoFactorCardProps = {
    isEnabled: boolean;
    backupCodesGenerated: boolean;
    backupCodesTotal?: number | null;
    backupCodesRemaining?: number | null;
    // Статус ещё не загружен — рисуем скелетон вместо неверного дефолта.
    isPending: boolean;
    isBusy: boolean;
    onPrimaryAction: () => void;
    onDisable: () => void;
    onGenerateBackupCodes: () => void;
};

// Порог «осталось мало кодов» — как у GitHub, предупреждаем заранее, а не при нуле.
const LOW_CODES_THRESHOLD = 3;

const TwoFactorCard: React.FC<TwoFactorCardProps> = ({
    isEnabled,
    backupCodesGenerated,
    backupCodesTotal,
    backupCodesRemaining,
    isPending,
    isBusy,
    onPrimaryAction,
    onDisable,
    onGenerateBackupCodes
}) => {
    if (isPending) {
        return (
            <div className="card security-card" data-testid="security-2fa-card" aria-busy="true">
                <div className="security-card-header">
                    <h3>Two-Factor Authentication</h3>
                    <span className="security-status-pill is-off">Loading</span>
                </div>
                <span className="security-skeleton-line" />
                <span className="security-skeleton-line is-short" />
            </div>
        );
    }

    return (
        <div className="card security-card" data-testid="security-2fa-card">
            <div className="security-card-header">
                <h3>Two-Factor Authentication</h3>
                <span className={`security-status-pill ${isEnabled ? 'is-on' : 'is-off'}`}>
                    {isEnabled ? 'Enabled' : 'Disabled'}
                </span>
            </div>
            <div className="security-card-actions">
                {isEnabled ? (
                    <>
                        <button type="button" className="btn btn-primary security-action-btn" onClick={onPrimaryAction} disabled={isBusy}>
                            Re-configure
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline security-action-btn security-danger-btn"
                            onClick={onDisable}
                            disabled={isBusy}
                        >
                            Disable 2FA
                        </button>
                    </>
                ) : (
                    <button type="button" className="btn btn-primary security-action-btn" onClick={onPrimaryAction} disabled={isBusy}>
                        Enable 2FA
                    </button>
                )}
                <Link className="security-link" to="/support/docs/account-recovery">
                    Learn how it works
                </Link>
            </div>
            {isEnabled && (
                <>
                    <div className="security-divider" aria-hidden="true" />
                    <div className="security-backup-row">
                        <p className="security-muted">
                            {!backupCodesGenerated
                                ? 'Backup codes: not generated'
                                : backupCodesRemaining == null
                                    ? 'Backup codes: generated'
                                    : backupCodesTotal == null
                                        ? `Backup codes: ${backupCodesRemaining} remaining`
                                        : `Backup codes: ${backupCodesRemaining} of ${backupCodesTotal} remaining`}
                        </p>
                        <button
                            type="button"
                            className="btn btn-outline security-secondary-btn"
                            onClick={onGenerateBackupCodes}
                            disabled={isBusy}
                        >
                            {backupCodesGenerated ? 'Regenerate' : 'Generate'}
                        </button>
                    </div>
                    {backupCodesGenerated && backupCodesRemaining != null && backupCodesRemaining <= LOW_CODES_THRESHOLD && (
                        <p className="security-warning-text" role="alert">
                            {backupCodesRemaining === 0
                                ? 'No backup codes left. Generate a new set now — without them you can lose access to your account if your authenticator is unavailable.'
                                : `Only ${backupCodesRemaining} backup code${backupCodesRemaining === 1 ? '' : 's'} left. Generate a new set soon.`}
                        </p>
                    )}
                </>
            )}
        </div>
    );
};

export default TwoFactorCard;
