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

const CheckoutForm: React.FC<CheckoutFormProps> = ({clientSecret}) => {
    const stripe = useStripe();
    const elements = useElements();

    const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

        const {error} = await stripe.confirmPayment({
            //`Elements` instance that was used to create the Payment Element
            elements,
            confirmParams: {
                return_url: `${publicAppUrl}/checkout/success`,
            },
        });


        if (error) {
            // This point will only be reached if there is an immediate error when
            // confirming the payment. Show error to your customer (for example, payment
            // details incomplete)
            setErrorMessage(error.message ?? 'Unable to process payment.');
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
            {errorMessage && <div className="checkout-stripe-error" role="alert">{errorMessage}</div>}
        </form>
    );
};

export default CheckoutForm;
