import React, {useState} from 'react';
import {
    useStripe,
    useElements,
    PaymentElement,
    ExpressCheckoutElement
} from '@stripe/react-stripe-js';
import { Link } from 'react-router-dom';
import {StripePaymentElementOptions} from '@stripe/stripe-js';

interface CheckoutFormProps {
    clientSecret: string;
}

/// Понятные причины отказа. Stripe присылает decline_code — он точнее общего сообщения
/// и объясняет покупателю, что именно делать дальше.
const DECLINE_REASONS: Record<string, string> = {
    insufficient_funds: 'Your card has insufficient funds. Try another card.',
    lost_card: 'This card was reported lost. Please use another card.',
    stolen_card: 'This card was reported stolen. Please use another card.',
    expired_card: 'Your card has expired. Please use another card.',
    incorrect_cvc: 'The security code (CVC) is incorrect.',
    incorrect_number: 'The card number is incorrect.',
    card_velocity_exceeded: 'Your card hit its usage limit. Try again later or use another card.',
    processing_error: 'The bank could not process this card right now. Try again or use another card.',
    do_not_honor: 'Your bank declined the payment. Contact your bank or use another card.',
    generic_decline: 'Your bank declined the payment without a reason. Try another card.',
    authentication_required: 'Your bank requires additional authentication. Please try again.',
};

/// Приоритет: конкретная причина отказа → сообщение Stripe → общий текст.
const describeStripeError = (error: { code?: string; decline_code?: string; message?: string }): string => {
    const known = (error.decline_code && DECLINE_REASONS[error.decline_code])
        ?? (error.code && DECLINE_REASONS[error.code]);
    return known ?? error.message ?? 'We could not process this payment. Please try again.';
};

const CheckoutForm: React.FC<CheckoutFormProps> = ({clientSecret}) => {
    const stripe = useStripe();
    const elements = useElements();

    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasExpressMethods, setHasExpressMethods] = useState(false);
    const publicAppUrl = window.__APP_CONFIG__?.publicAppUrl ?? window.location.origin;

    const handleSubmit = async (event: any) => {
        // We don't want to let default form submission happen here,
        // which would refresh the page.
        event.preventDefault();

        if (!stripe || !elements) {
            // Stripe.js hasn't yet loaded.
            // Make sure to disable form submission until Stripe.js has loaded.
            return;
        }

        setIsSubmitting(true);
        setErrorMessage(null);
        setErrorCode(null);

        const {error} = await stripe.confirmPayment({
            //`Elements` instance that was used to create the Payment Element
            elements,
            confirmParams: {
                return_url: `${publicAppUrl}/checkout/success`,
            },
        });


        if (error) {
            // Особый случай: платёж УЖЕ прошёл (двойная отправка, возврат «назад» на чекаут).
            // Показывать здесь ошибку нельзя — деньги списаны. Ведём на success-страницу,
            // она доведёт заказ до конца по тому же paymentIntentId.
            if (error.code === 'payment_intent_unexpected_state') {
                const paymentIntentId = clientSecret.split('_secret')[0];
                window.location.assign(`${publicAppUrl}/checkout/success?payment_intent=${paymentIntentId}`);
                return;
            }

            setErrorMessage(describeStripeError(error));
            setErrorCode(error.decline_code ?? error.code ?? null);
            setIsSubmitting(false);
        } else {
            // Your customer will be redirected to your `return_url`. For some payment
            // methods like iDEAL, your customer will be redirected to an intermediate
            // site first to authorize the payment, then redirected to the `return_url`.
        }
    };

    const handleConfirmExpressCheckout = (event: any) => {
        event.confirm();
    };

    const paymentElementOptions: StripePaymentElementOptions = {
        layout: "tabs"
    };

    return (
        <form onSubmit={handleSubmit} className="checkout-stripe-form">
            <div className="checkout-stripe-express" hidden={!hasExpressMethods}>
                <ExpressCheckoutElement
                    onConfirm={handleConfirmExpressCheckout}
                    onReady={(event) => setHasExpressMethods(Boolean(event.availablePaymentMethods))}
                />
            </div>
            {hasExpressMethods && <div className="checkout-stripe-divider"><span>or pay with card</span></div>}
            <PaymentElement options={paymentElementOptions}/>
            <button
                disabled={!stripe || isSubmitting}
                className="btn btn-primary checkout-stripe-submit"
                data-testid="place-order-button"
                type="submit"
            >
                {isSubmitting ? 'Processing...' : 'Place Order'}
            </button>
            <Link to="/checkout/cancel" className="btn btn-outline checkout-stripe-cancel">
                Cancel
            </Link>
            {errorMessage && (
                <div className="checkout-stripe-error" role="alert">
                    <span>{errorMessage}</span>
                    {errorCode && <span className="checkout-stripe-error__code">Code: {errorCode}</span>}
                </div>
            )}
        </form>
    );
};

export default CheckoutForm;
