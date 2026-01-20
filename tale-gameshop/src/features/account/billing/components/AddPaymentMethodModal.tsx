import React, {useEffect, useMemo, useState} from 'react';
import {Elements, PaymentElement, useElements, useStripe} from '@stripe/react-stripe-js';
import {loadStripe} from '@stripe/stripe-js';

type AddPaymentMethodModalProps = {
    isOpen: boolean;
    clientSecret: string | null;
    isLoading: boolean;
    onClose: () => void;
    onSave: () => Promise<void>;
    onRequestIntent: () => Promise<void>;
};

const stripePromise = loadStripe(
    (window as any).__APP_CONFIG__?.stripePublishableKey ??
    'pk_test_51PYcsW2NLq3ZGHldXb1IU6dygsBlIXn9jw2jXaFCisQOE5RBfmvVF0phul3EDhFE8RPxgdLrd6K3s5lasn0l7Aqt00E0IpEiZW'
);

const PaymentElementForm: React.FC<{ onSave: () => Promise<void>; isLoading: boolean }> = ({onSave, isLoading}) => {
    const stripe = useStripe();
    const elements = useElements();
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!stripe || !elements) {
            return;
        }
        const result = await stripe.confirmSetup({
            elements,
            redirect: 'if_required'
        });

        if (result.error) {
            setError(result.error.message ?? 'Unable to add payment method.');
            return;
        }

        await onSave();
    };

    return (
        <div className="billing-modal-body">
            <PaymentElement />
            {error && <p className="billing-modal-error">{error}</p>}
            <div className="billing-modal-actions">
                <button type="button" className="btn btn-outline" onClick={handleSubmit} disabled={isLoading || !stripe}>
                    Save method
                </button>
            </div>
        </div>
    );
};

const AddPaymentMethodModal: React.FC<AddPaymentMethodModalProps> = ({
    isOpen,
    clientSecret,
    isLoading,
    onClose,
    onSave,
    onRequestIntent
}) => {
    const stripeKeyReady = useMemo(() => Boolean((window as any).__APP_CONFIG__?.stripePublishableKey), []);

    useEffect(() => {
        if (isOpen) {
            onRequestIntent();
        }
    }, [isOpen, onRequestIntent]);

    if (!isOpen) {
        return null;
    }

    return (
        <div className="billing-modal-overlay">
            <div className="billing-modal">
                <div className="billing-modal-header">
                    <h3>Add payment method</h3>
                    <button type="button" className="billing-modal-close" onClick={onClose}>
                        ✕
                    </button>
                </div>
                {!stripeKeyReady && (
                    <p className="billing-modal-error">Stripe publishable key is missing.</p>
                )}
                {stripeKeyReady && clientSecret && (
                    <Elements options={{clientSecret}} stripe={stripePromise}>
                        <PaymentElementForm onSave={onSave} isLoading={isLoading} />
                    </Elements>
                )}
                {stripeKeyReady && !clientSecret && <p>Loading Stripe form…</p>}
            </div>
        </div>
    );
};

export default AddPaymentMethodModal;
