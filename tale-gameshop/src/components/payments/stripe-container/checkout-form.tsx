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
        layout: "accordion"
    };

    return (
        <form onSubmit={handleSubmit} className="checkout-stripe-form">
            <ExpressCheckoutElement onConfirm={handleConfirmExpressCheckout}/>
            <PaymentElement options={paymentElementOptions}/>
            <button
                disabled={!stripe}
                className="btn btn-primary checkout-stripe-submit"
                data-testid="place-order-button"
                type="submit"
            >
                Place Order
            </button>
            <Link to="/checkout/cancel" className="btn btn-outline checkout-stripe-submit">
                Cancel
            </Link>
            {/* Show error message to your customers */}
            {errorMessage && <div>{errorMessage}</div>}
        </form>
    );
};

export default CheckoutForm;
