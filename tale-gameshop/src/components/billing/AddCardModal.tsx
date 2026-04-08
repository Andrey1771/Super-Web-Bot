import React, { useEffect, useMemo, useState } from 'react';
import { CardCvcElement, CardExpiryElement, CardNumberElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import type { StripeCardNumberElementOptions } from '@stripe/stripe-js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock } from '@fortawesome/free-solid-svg-icons';
import { createStripePromise } from '../../utils/stripe-loader';

const stripePublishableKey = typeof window !== 'undefined'
    ? window.__APP_CONFIG__?.stripePublishableKey ?? ''
    : '';
const stripePromise = createStripePromise(stripePublishableKey);

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
                    setErrorMessage('Unable to start card setup. Please try again.');
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
            setErrorMessage('Card number is missing.');
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
            setErrorMessage(result.error.message ?? 'Card setup failed.');
            setIsSubmitting(false);
            return;
        }

        setIsSubmitting(false);
        onSuccess();
    };

    return (
        <form className="billing-modal-body" onSubmit={handleSubmit}>
            <h3>Link a bank card</h3>
            <p className="billing-modal-subtitle">Add a card for quick payments and subscriptions.</p>
            <div className="billing-info-banner">
                We will charge and immediately refund a small amount to verify the card.
            </div>
            <div className="billing-card-form">
                <label className="billing-field">
                    <span>Card number</span>
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
                        <span>MM/YY</span>
                        <div className="billing-stripe-input">
                            {isLoading ? (
                                <div className="billing-input-skeleton" />
                            ) : (
                                <CardExpiryElement options={elementStyle} />
                            )}
                        </div>
                    </label>
                    <label className="billing-field">
                        <span>CVC/CVV</span>
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
                    <span className="billing-card-brand">Visa</span>
                    <span className="billing-card-brand">Mastercard</span>
                    <span className="billing-card-brand">Maestro</span>
                    <span className="billing-card-brand">Mir</span>
                </div>
                <div className="billing-secure-row">
                    <FontAwesomeIcon icon={faLock} />
                    <span>Your data is securely protected</span>
                </div>
            </div>
            {errorMessage && <div className="billing-error-text">{errorMessage}</div>}
            <div className="billing-modal-actions">
                <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting || isLoading || !stripe}>
                    {isSubmitting ? 'Linking...' : 'Link card'}
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
    const elementsOptions = useMemo(() => ({
        fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' }]
    }), []);

    if (!isOpen) {
        return null;
    }

    if (!stripePromise) {
        return (
            <div className="billing-modal-overlay" role="dialog" aria-modal="true">
                <div className="billing-modal">
                    <div className="billing-modal-body">
                        <h3>Link a bank card</h3>
                        <p className="billing-modal-subtitle">
                            Stripe publishable key is missing. Please configure window.__APP_CONFIG__.stripePublishableKey.
                        </p>
                        <div className="billing-modal-actions">
                            <button type="button" className="btn btn-outline" onClick={onClose}>
                                Close
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
