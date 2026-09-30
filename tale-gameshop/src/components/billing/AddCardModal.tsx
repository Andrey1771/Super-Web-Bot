import { useSitePreferences } from '../../context/site-preferences';
import { stripeLocaleFor } from '../cart/checkout-page/stripe-elements-options';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import React, { useEffect, useMemo, useState } from 'react';
import { CardCvcElement, CardExpiryElement, CardNumberElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import type { StripeCardNumberElementOptions } from '@stripe/stripe-js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock } from '@fortawesome/free-solid-svg-icons';
import { getStripe } from '../../utils/stripe-loader';
import CardBrandIcon from './CardBrandIcon';

const elementStyle = {
    style: {
        base: {
            color: '#1f2937',
            fontSize: '15px',
            fontFamily: 'Inter, system-ui, sans-serif',
            '::placeholder': {
                color: '#9ca3af'
            }
        },
        invalid: {
            color: '#ef4444'
        }
    }
};

const numberOptions: StripeCardNumberElementOptions = {
    showIcon: true,
    style: elementStyle.style
};

interface AddCardModalProps {
    isOpen: boolean;
    displayName?: string;
    onClose: () => void;
    onCreateSetupIntent: () => Promise<string>;
    onSuccess: () => void;
}

const AddCardForm: React.FC<Pick<AddCardModalProps, 'displayName' | 'onClose' | 'onSuccess' | 'onCreateSetupIntent'>> = ({
    displayName,
    onClose,
    onSuccess,
    onCreateSetupIntent
}) => {
    const { t } = useTranslation();
    const stripe = useStripe();
    const elements = useElements();
    const [clientSecret, setClientSecret] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const loadIntent = async () => {
            setIsLoading(true);
            setErrorMessage(null);
            try {
                const secret = await onCreateSetupIntent();
                if (isMounted) {
                    setClientSecret(secret);
                }
            } catch (error) {
                if (isMounted) {
                    setErrorMessage(t('billing.setupFailed'));
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadIntent();

        return () => {
            isMounted = false;
        };
    }, [onCreateSetupIntent]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!stripe || !elements || !clientSecret) {
            return;
        }

        setIsSubmitting(true);
        setErrorMessage(null);

        const cardElement = elements.getElement(CardNumberElement);
        if (!cardElement) {
            setErrorMessage(t('billing.numberMissing'));
            setIsSubmitting(false);
            return;
        }

        const result = await stripe.confirmCardSetup(clientSecret, {
            payment_method: {
                card: cardElement,
                billing_details: {
                    name: displayName || undefined
                }
            }
        });

        if (result.error) {
            setErrorMessage(result.error.message ?? t('billing.cardSetupFailed'));
            setIsSubmitting(false);
            return;
        }

        setIsSubmitting(false);
        onSuccess();
    };

    return (
        <form className="billing-modal-body" onSubmit={handleSubmit}>
            <h3>{t('billing.linkCard')}</h3>
            <p className="billing-modal-subtitle">{t('billing.linkSubtitle')}</p>
            <div className="billing-info-banner">{t('billing.verifyNote')}</div>
            <div className="billing-card-form">
                <label className="billing-field">
                    <span>{t('billing.cardNumber')}</span>
                    <div className="billing-stripe-input">
                        {isLoading ? (
                            <div className="billing-input-skeleton" />
                        ) : (
                            <CardNumberElement options={numberOptions} />
                        )}
                    </div>
                </label>
                <div className="billing-form-row">
                    <label className="billing-field">
                        <span>{t('billing.expiry')}</span>
                        <div className="billing-stripe-input">
                            {isLoading ? (
                                <div className="billing-input-skeleton" />
                            ) : (
                                <CardExpiryElement options={elementStyle} />
                            )}
                        </div>
                    </label>
                    <label className="billing-field">
                        <span>{t('billing.cvc')}</span>
                        <div className="billing-stripe-input">
                            {isLoading ? (
                                <div className="billing-input-skeleton" />
                            ) : (
                                <CardCvcElement options={elementStyle} />
                            )}
                        </div>
                    </label>
                </div>
                <div className="billing-card-brands">
                    {['visa', 'mastercard', 'amex'].map((brand) => (
                        <CardBrandIcon key={brand} brand={brand} />
                    ))}
                </div>
                <div className="billing-secure-row">
                    <FontAwesomeIcon icon={faLock} />
                    <span>{t('billing.secure')}</span>
                </div>
            </div>
            {errorMessage && <div className="billing-error-text">{errorMessage}</div>}
            <div className="billing-modal-actions">
                <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
                    {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting || isLoading || !stripe}>
                    {isSubmitting ? t('billing.linking') : t('billing.link')}
                </button>
            </div>
        </form>
    );
};

const AddCardModal: React.FC<AddCardModalProps> = ({
    isOpen,
    displayName,
    onClose,
    onCreateSetupIntent,
    onSuccess
}) => {
    const { lang } = useSitePreferences();
    const elementsOptions = useMemo(() => ({
        fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' }],
        locale: stripeLocaleFor(lang),
    }), [lang]);

    if (!isOpen) {
        return null;
    }

    // Загружаем Stripe.js только когда модалку действительно открыли: до этого момента
    // она возвращает null, и трогать чужой CDN незачем.
    const stripePromise = getStripe();

    if (!stripePromise) {
        return (
            <div className="billing-modal-overlay" role="dialog" aria-modal="true">
                <div className="billing-modal">
                    <div className="billing-modal-body">
                        <h3>{i18n.t('billing.linkCard')}</h3>
                        <p className="billing-modal-subtitle">{i18n.t('billing.keyMissing')}</p>
                        <div className="billing-modal-actions">
                            <button type="button" className="btn btn-outline" onClick={onClose}>
                                {i18n.t('common.close')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="billing-modal-overlay" role="dialog" aria-modal="true">
            <div className="billing-modal">
                <Elements stripe={stripePromise} options={elementsOptions}>
                    <AddCardForm
                        displayName={displayName}
                        onClose={onClose}
                        onCreateSetupIntent={onCreateSetupIntent}
                        onSuccess={onSuccess}
                    />
                </Elements>
            </div>
        </div>
    );
};

export default AddCardModal;
