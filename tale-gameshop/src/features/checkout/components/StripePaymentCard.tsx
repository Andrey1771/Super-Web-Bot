import React from 'react';
import './stripe-payment-card.css';

type StripePaymentCardProps = {
    children: React.ReactNode;
};

const StripePaymentCard: React.FC<StripePaymentCardProps> = ({children}) => (
    <div className="card stripe-payment-card" data-testid="stripe-payment-card">
        <div className="stripe-payment-header">
            <h2>Payment method</h2>
            <p>Payments are processed securely by Stripe.</p>
        </div>
        <div className="stripe-payment-body">{children}</div>
        <p className="stripe-payment-note">
            By placing your order, you agree to our Terms of Service and Refund Policy.
        </p>
    </div>
);

export default StripePaymentCard;
