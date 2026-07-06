import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { cancelRecoveryByToken, submitRecoveryRequest } from '../../api/accountRecoveryApi';
import './account-recovery-page.css';

// Публичная страница: работает для запертого снаружи пользователя (без логина).
// Тот же роут с ?token= — отмена заявки по ссылке из письма.

const AccountRecoveryPage: React.FC = () => {
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
            setError('Enter the email address linked to your account.');
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
            setError('Something went wrong. Please try again in a minute.');
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
                        <h1>Request received</h1>
                        <p>
                            If the email you entered matches an account, we sent a confirmation message to it.
                            Verification can take up to a few days because of a mandatory waiting period — we
                            will keep you updated by email.
                        </p>
                        <p className="recovery-muted">
                            Meanwhile, if you regain access to your authenticator or find a backup code, you can
                            simply sign in — and cancel the request from Account → Security.
                        </p>
                        <Link to="/support" className="btn btn-outline">Back to Support</Link>
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
                            <h1>Account recovery</h1>
                            <p className="recovery-muted">
                                Lost access to your authenticator and backup codes? Request a manual reset of
                                two-factor authentication. First check the{' '}
                                <Link to="/support/docs/account-recovery">self-service options</Link> — they are faster.
                            </p>
                        </div>
                    </div>

                    <form className="recovery-form" onSubmit={handleSubmit}>
                        <label className="recovery-field">
                            <span>Account email *</span>
                            <input
                                type="email"
                                value={accountEmail}
                                onChange={(e) => setAccountEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                            />
                        </label>
                        <label className="recovery-field">
                            <span>Contact email (if different)</span>
                            <input
                                type="email"
                                value={contactEmail}
                                onChange={(e) => setContactEmail(e.target.value)}
                                placeholder="Where we can reach you"
                            />
                        </label>
                        <div className="recovery-field-row">
                            <label className="recovery-field">
                                <span>Recent order numbers</span>
                                <input
                                    type="text"
                                    value={orderNumbers}
                                    onChange={(e) => setOrderNumbers(e.target.value)}
                                    placeholder="e.g. TS-10023, TS-10057"
                                />
                            </label>
                            <label className="recovery-field">
                                <span>Card last 4 digits</span>
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
                            <span>Anything else that proves the account is yours</span>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                rows={4}
                                maxLength={2000}
                                placeholder="Approximate registration date, games you bought, payment amounts…"
                            />
                        </label>
                        {error && <p className="recovery-error" role="alert">{error}</p>}
                        <button type="submit" className="btn btn-primary recovery-submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Submitting…' : 'Submit recovery request'}
                        </button>
                        <p className="recovery-muted recovery-fineprint">
                            We verify every request against order and payment history, notify the account email at
                            each step, and apply a waiting period of up to 72 hours before anything is changed. We
                            will never ask for your password or full card number.
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
};

// Отмена по ссылке из письма: /account-recovery/cancel?token=…
export const AccountRecoveryCancelPage: React.FC = () => {
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
                            <h1>Recovery request cancelled</h1>
                            <p>Nothing was changed on the account. If you believe someone is targeting your account, consider changing your password and reviewing active sessions.</p>
                            <Link to="/" className="btn btn-primary">Back to Home</Link>
                        </>
                    ) : state === 'failed' ? (
                        <>
                            <h1>Link is no longer valid</h1>
                            <p className="recovery-muted">
                                The request may already be cancelled, completed, or the link has expired. If you
                                still have concerns, contact support.
                            </p>
                            <Link to="/support" className="btn btn-outline">Contact support</Link>
                        </>
                    ) : (
                        <>
                            <h1>Cancel account recovery?</h1>
                            <p className="recovery-muted">
                                This will stop the pending two-factor authentication reset for your account.
                            </p>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleCancel}
                                disabled={state === 'working' || !token}
                            >
                                {state === 'working' ? 'Cancelling…' : 'Yes, cancel the request'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AccountRecoveryPage;
