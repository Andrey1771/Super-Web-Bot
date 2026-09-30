import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { cancelRecoveryByToken, submitRecoveryRequest } from '../../api/accountRecoveryApi';
import './account-recovery-page.css';

// Публичная страница: работает для запертого снаружи пользователя (без логина).
// Тот же роут с ?token= — отмена заявки по ссылке из письма.

const AccountRecoveryPage: React.FC = () => {
    const { t } = useTranslation();
    const [accountEmail, setAccountEmail] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [orderNumbers, setOrderNumbers] = useState('');
    const [cardLast4, setCardLast4] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!accountEmail.trim() || !accountEmail.includes('@')) {
            setError(t('recovery.errEmail'));
            return;
        }
        setError(null);
        setIsSubmitting(true);
        try {
            await submitRecoveryRequest({
                accountEmail: accountEmail.trim(),
                contactEmail: contactEmail.trim() || undefined,
                orderNumbers: orderNumbers.trim() || undefined,
                cardLast4: cardLast4.trim() || undefined,
                message: message.trim() || undefined
            });
            setIsSubmitted(true);
        } catch {
            setError(t('recovery.failed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSubmitted) {
        return (
            <div className="recovery-page">
                <div className="container recovery-container">
                    <div className="card recovery-card recovery-success">
                        <FontAwesomeIcon icon={faCircleCheck} className="recovery-success-icon" />
                        <h1>{t('recovery.received')}</h1>
                        <p>{t('recovery.receivedText')}</p>
                        <p className="recovery-muted">{t('recovery.meanwhile')}</p>
                        <Link to="/support" className="btn btn-outline">{t('common.backToSupport')}</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="recovery-page">
            <div className="container recovery-container">
                <div className="card recovery-card">
                    <div className="recovery-header">
                        <div className="recovery-icon" aria-hidden="true">
                            <FontAwesomeIcon icon={faShieldHalved} />
                        </div>
                        <div>
                            <h1>{t('recovery.title')}</h1>
                            <p className="recovery-muted">
                                {t('recovery.introBefore')}
                                <Link to="/support/docs/account-recovery">{t('recovery.selfService')}</Link>{t('recovery.introAfter')}
                            </p>
                        </div>
                    </div>

                    <form className="recovery-form" onSubmit={handleSubmit}>
                        <label className="recovery-field">
                            <span>{t('recovery.accountEmail')}</span>
                            <input
                                type="email"
                                value={accountEmail}
                                onChange={(e) => setAccountEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                            />
                        </label>
                        <label className="recovery-field">
                            <span>{t('recovery.contactEmail')}</span>
                            <input
                                type="email"
                                value={contactEmail}
                                onChange={(e) => setContactEmail(e.target.value)}
                                placeholder={t('recovery.contactPlaceholder')}
                            />
                        </label>
                        <div className="recovery-field-row">
                            <label className="recovery-field">
                                <span>{t('recovery.orderNumbers')}</span>
                                <input
                                    type="text"
                                    value={orderNumbers}
                                    onChange={(e) => setOrderNumbers(e.target.value)}
                                    placeholder={t('recovery.orderPlaceholder')}
                                />
                            </label>
                            <label className="recovery-field">
                                <span>{t('recovery.cardLast4')}</span>
                                <input
                                    type="text"
                                    value={cardLast4}
                                    onChange={(e) => setCardLast4(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                                    placeholder="1234"
                                    inputMode="numeric"
                                />
                            </label>
                        </div>
                        <label className="recovery-field">
                            <span>{t('recovery.proof')}</span>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                rows={4}
                                maxLength={2000}
                                placeholder={t('recovery.proofPlaceholder')}
                            />
                        </label>
                        {error && <p className="recovery-error" role="alert">{error}</p>}
                        <button type="submit" className="btn btn-primary recovery-submit" disabled={isSubmitting}>
                            {isSubmitting ? t('common.submitting') : t('recovery.submit')}
                        </button>
                        <p className="recovery-muted recovery-fineprint">
                            {t('recovery.note')}
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
};

// Отмена по ссылке из письма: /account-recovery/cancel?token=…
export const AccountRecoveryCancelPage: React.FC = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const token = new URLSearchParams(location.search).get('token') ?? '';
    const [state, setState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');

    const handleCancel = async () => {
        setState('working');
        try {
            const cancelled = await cancelRecoveryByToken(token);
            setState(cancelled ? 'done' : 'failed');
        } catch {
            setState('failed');
        }
    };

    return (
        <div className="recovery-page">
            <div className="container recovery-container">
                <div className="card recovery-card recovery-success">
                    {state === 'done' ? (
                        <>
                            <FontAwesomeIcon icon={faCircleCheck} className="recovery-success-icon" />
                            <h1>{t('recovery.cancelled')}</h1>
                            <p>{t('recovery.cancelledText')}</p>
                            <Link to="/" className="btn btn-primary">{t('recovery.backHome')}</Link>
                        </>
                    ) : state === 'failed' ? (
                        <>
                            <h1>{t('recovery.linkExpired')}</h1>
                            <p className="recovery-muted">{t('recovery.linkExpiredText')}</p>
                            <Link to="/support" className="btn btn-outline">{t('common.contactSupport')}</Link>
                        </>
                    ) : (
                        <>
                            <h1>{t('recovery.cancelTitle')}</h1>
                            <p className="recovery-muted">{t('recovery.cancelText')}</p>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleCancel}
                                disabled={state === 'working' || !token}
                            >
                                {state === 'working' ? t('account.cancelling') : t('recovery.cancelConfirm')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AccountRecoveryPage;
