import React, { useEffect, useState } from 'react';
import { PaymentRequestButtonElement, useStripe } from '@stripe/react-stripe-js';

const PaymentRequestForm = () => {
    const stripe = useStripe();
    const [paymentRequest, setPaymentRequest] = useState(null);

    useEffect(() => {
        if (stripe) {
            const pr = stripe.paymentRequest({
                country: 'US',
                currency: 'usd',
                total: {
                    label: 'Total',
                    amount: 1000,
                },
                requestPayerName: true,
                requestPayerEmail: true,
            });

            pr.canMakePayment().then((result) => {
                if (result) {
                    setPaymentRequest(pr);
                }
            });
        }
    }, [stripe]);

    if (!paymentRequest) {
        return null;
    }

    return <PaymentRequestButtonElement options={{ paymentRequest }} />;
};

export default PaymentRequestForm;
