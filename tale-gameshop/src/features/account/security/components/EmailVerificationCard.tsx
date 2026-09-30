import {useTranslation} from 'react-i18next';
import React, {useEffect, useState} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faChevronRight} from '@fortawesome/free-solid-svg-icons';

const RESEND_COOLDOWN_SECONDS = 60;

type EmailVerificationCardProps = {
    emailVerified: boolean;
    // Статус ещё не загружен — рисуем скелетон вместо неверного дефолта.
    isPending: boolean;
    isBusy: boolean;
    onResend: () => Promise<boolean>;
    onChangeEmail: () => void;
};

const formatCooldown = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const EmailVerificationCard: React.FC<EmailVerificationCardProps> = ({
    emailVerified,
    isPending,
    isBusy,
    onResend,
    onChangeEmail
}) => {
    const {t} = useTranslation();
    const [cooldown, setCooldown] = useState(0);
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        if (cooldown <= 0) {
            return;
        }
        const timer = window.setTimeout(() => setCooldown((prev) => prev - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [cooldown]);

    const handleResend = async () => {
        if (isSending || cooldown > 0) {
            return;
        }
        setIsSending(true);
        try {
            const sent = await onResend();
            if (sent) {
                setCooldown(RESEND_COOLDOWN_SECONDS);
            }
        } finally {
            setIsSending(false);
        }
    };

    if (isPending) {
        return (
            <div className="card security-card" data-testid="security-email-card" aria-busy="true">
                <div className="security-card-header">
                    <h3>{t('account.security.email.title')}</h3>
                    <span className="security-status-pill is-off">{t('common.loading')}</span>
                </div>
                <span className="security-skeleton-line" />
                <span className="security-skeleton-line is-short" />
            </div>
        );
    }

    return (
        <div className="card security-card" data-testid="security-email-card">
            <div className="security-card-header">
                <h3>{t('account.security.email.title')}</h3>
                <span className={`security-status-pill ${emailVerified ? 'is-on' : ''}`}>
                    {emailVerified ? t('common.verified') : t('common.notVerified')}
                </span>
            </div>
            {emailVerified ? (
                <>
                    <p className="security-muted">{t('account.security.email.protected')}</p>
                    <div className="security-email-actions">
                        <button type="button" className="btn btn-outline security-secondary-btn" onClick={onChangeEmail}>
                            {t('account.security.email.changeEmail')}
                            <FontAwesomeIcon icon={faChevronRight} />
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <p className="security-muted">{t('account.security.email.verifyHint')}</p>
                    <div className="security-email-actions">
                        <button
                            type="button"
                            className="btn btn-primary security-secondary-btn"
                            onClick={handleResend}
                            disabled={isBusy || isSending || cooldown > 0}
                        >
                            {cooldown > 0 ? t('account.security.email.sentResendIn', {time: formatCooldown(cooldown)}) : t('account.security.email.resend')}
                        </button>
                        <button type="button" className="btn btn-outline security-secondary-btn" onClick={onChangeEmail}>
                            {t('account.security.email.changeEmail')}
                            <FontAwesomeIcon icon={faChevronRight} />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default EmailVerificationCard;
