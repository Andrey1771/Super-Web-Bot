import {useTranslation} from 'react-i18next';
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
    const {t} = useTranslation();
    if (isPending) {
        return (
            <div className="card security-card" data-testid="security-2fa-card" aria-busy="true">
                <div className="security-card-header">
                    <h3>{t('account.security.twoFactor.title')}</h3>
                    <span className="security-status-pill is-off">{t('common.loading')}</span>
                </div>
                <span className="security-skeleton-line" />
                <span className="security-skeleton-line is-short" />
            </div>
        );
    }

    return (
        <div className="card security-card" data-testid="security-2fa-card">
            <div className="security-card-header">
                <h3>{t('account.security.twoFactor.title')}</h3>
                <span className={`security-status-pill ${isEnabled ? 'is-on' : 'is-off'}`}>
                    {isEnabled ? t('common.enabled') : t('common.disabled')}
                </span>
            </div>
            <div className="security-card-actions">
                {isEnabled ? (
                    <>
                        <button type="button" className="btn btn-primary security-action-btn" onClick={onPrimaryAction} disabled={isBusy}>
                            {t('account.security.twoFactor.reconfigure')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline security-action-btn security-danger-btn"
                            onClick={onDisable}
                            disabled={isBusy}
                        >
                            {t('account.security.twoFactor.disable')}
                        </button>
                    </>
                ) : (
                    <button type="button" className="btn btn-primary security-action-btn" onClick={onPrimaryAction} disabled={isBusy}>
                        {t('account.security.twoFactor.enable')}
                    </button>
                )}
                <Link className="security-link" to="/support/docs/account-recovery">
                    {t('account.security.twoFactor.learn')}
                </Link>
            </div>
            {isEnabled && (
                <>
                    <div className="security-divider" aria-hidden="true" />
                    <div className="security-backup-row">
                        <p className="security-muted">
                            {!backupCodesGenerated
                                ? t('account.security.twoFactor.codesNone')
                                : backupCodesRemaining == null
                                    ? t('account.security.twoFactor.codesGenerated')
                                    : backupCodesTotal == null
                                        ? t('account.security.twoFactor.codesRemaining', {count: backupCodesRemaining})
                                        : t('account.security.twoFactor.codesOf', {count: backupCodesRemaining, total: backupCodesTotal})}
                        </p>
                        <button
                            type="button"
                            className="btn btn-outline security-secondary-btn"
                            onClick={onGenerateBackupCodes}
                            disabled={isBusy}
                        >
                            {backupCodesGenerated ? t('account.security.twoFactor.regenerate') : t('account.security.twoFactor.generate')}
                        </button>
                    </div>
                    {backupCodesGenerated && backupCodesRemaining != null && backupCodesRemaining <= LOW_CODES_THRESHOLD && (
                        <p className="security-warning-text" role="alert">
                            {backupCodesRemaining === 0
                                ? t('account.security.twoFactor.noCodesLeft')
                                : t('account.security.twoFactor.fewCodesLeft', {count: backupCodesRemaining})}
                        </p>
                    )}
                </>
            )}
        </div>
    );
};

export default TwoFactorCard;
