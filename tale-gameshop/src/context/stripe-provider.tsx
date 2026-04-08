import React from 'react';
import { Elements } from "@stripe/react-stripe-js";
import { createStripePromise } from '../utils/stripe-loader';
const stripePromise = createStripePromise('pk_test_51PYcsW2NLq3ZGHldXb1IU6dygsBlIXn9jw2jXaFCisQOE5RBfmvVF0phul3EDhFE8RPxgdLrd6K3s5lasn0l7Aqt00E0IpEiZW');

const StripeProvider: React.FC<{ children: React.ReactNode, clientSecret: string, mode: string }> = ({ children, clientSecret, mode }) => {
    if (!stripePromise) {
        return <>{children}</>;
    }

    // @ts-ignore
    return (
        <Elements stripe={stripePromise} options={{clientSecret: clientSecret, mode: mode}}>
            {children}
        </Elements>
    );
};

export default StripeProvider;
