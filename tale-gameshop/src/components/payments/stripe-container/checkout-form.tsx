import React, {useEffect, useState} from 'react';
import {
    CardElement,
    useStripe,
    useElements,
    PaymentElement,
    AuBankAccountElement,
    EpsBankElement, PaymentRequestButtonElement, P24BankElement,
    useCheckout,
    ExpressCheckoutElement, AddressElement
} from '@stripe/react-stripe-js';
import {Order, StripeElementsOptionsClientSecret, StripePaymentElementOptions} from '@stripe/stripe-js';
import axios from "axios";
import {Game} from "../../../models/game";

interface CheckoutFormProps {
    clientSecret: string
}

type Mode = 'payment' | 'setup' | 'subscription';

const CheckoutForm: React.FC<CheckoutFormProps> = ({clientSecret}) => {
    const stripe = useStripe();
    const elements = useElements();

    const [errorMessage, setErrorMessage] = useState(null);
    const [paymentRequest, setPaymentRequest] = useState<any>(null);

    useEffect(() => {
        /*if (!stripe) {
            return;
        }

        /!*const elements = stripe.elements({
            mode: 'setup',
            amount: 1099,
            currency: 'usd',
            setupFutureUsage: 'off_session',
            paymentMethodCreation: 'manual'
        })*!/

        const pr = stripe.paymentRequest({
            country: 'US', // Замените на вашу страну
            currency: 'usd', // Замените на вашу валюту
            total: {
                label: 'Total',
                amount: 1000, // Сумма в центах
            },
            requestPayerName: true,
            requestPayerEmail: true,
        });

        pr.canMakePayment().then((result) => {
            if (result) {
                setPaymentRequest(pr);
            } else {
                console.error('PaymentRequest not supported on this device');
                setErrorMessage('PaymentRequest не поддерживается на вашем устройстве.');
            }
        });*/

    }, [stripe]);

    const handlePaymentRequestSuccess = () => {
        console.log('PaymentRequest completed successfully');
    };
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
                return_url: 'https://example.com/order/123/complete',
            },
        });


        if (error) {
            // This point will only be reached if there is an immediate error when
            // confirming the payment. Show error to your customer (for example, payment
            // details incomplete)
            //setErrorMessage(error.message ?? null);
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
        <form onSubmit={handleSubmit}>
            <ExpressCheckoutElement onConfirm={handleConfirmExpressCheckout}/>
            <PaymentElement options={paymentElementOptions}/>
            <button
                disabled={!stripe}
                className="w-full px-4 py-2 bg-green-500 text-white font-bold rounded hover:bg-green-700 mt-3"
            >
                Place Order
            </button>
            {/* Show error message to your customers */}
            {errorMessage && <div>{errorMessage}</div>}
        </form>
    )
};

export default CheckoutForm;
