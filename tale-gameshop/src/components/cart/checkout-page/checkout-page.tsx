import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Elements} from '@stripe/react-stripe-js';
import {loadStripe} from '@stripe/stripe-js';
import axios from 'axios';
import {useCart} from '../../../context/cart-context';
import CheckoutForm from '../../payments/stripe-container/checkout-form';
import './checkout-page.css';
import container from '../../../inversify.config';
import {IUrlService} from '../../../iterfaces/i-url-service';
import IDENTIFIERS from '../../../constants/identifiers';
import OrderSummaryCard from '../../../features/checkout/components/OrderSummaryCard';
import StripePaymentCard from '../../../features/checkout/components/StripePaymentCard';
import {calculateCheckoutTotals} from '../../../features/checkout/utils/checkout-totals';
import { analyticsClient } from '../../../utils/analytics-client';

const stripePromise = loadStripe(
    'pk_test_51PYcsW2NLq3ZGHldXb1IU6dygsBlIXn9jw2jXaFCisQOE5RBfmvVF0phul3EDhFE8RPxgdLrd6K3s5lasn0l7Aqt00E0IpEiZW'
);

const CheckoutPage: React.FC = () => {
    const {state} = useCart();
    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
    const totals = useMemo(() => calculateCheckoutTotals(state.items), [state.items]);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const hasTrackedCheckout = useRef(false);

    useEffect(() => {
        if (!hasTrackedCheckout.current && totals.total > 0 && state.items.length > 0) {
            analyticsClient.trackEcommerce("begin_checkout", {
                currency: "UAH",
                value: totals.total,
                items: state.items.map((item) => ({
                    item_id: item.gameId,
                    item_name: item.name,
                    price: item.price,
                    quantity: item.quantity
                }))
            });
            hasTrackedCheckout.current = true;
        }
    }, [state.items, totals.total]);

    useEffect(() => {
        const fetchClientSecret = async () => {
            if (totals.total <= 0) {
                setClientSecret(null);
                return;
            }

            const {data} = await axios.post(`${urlService.apiBaseUrl}/api/payments/create-payment-intent`, {
                amount: totals.total
            });

            setClientSecret(data.clientSecret);
        };

        fetchClientSecret();
    }, [totals.total, urlService.apiBaseUrl]);

    const options = {
        clientSecret: clientSecret ?? undefined,
        appearance: {},
        requestPayerName: true,
        requestPayerEmail: true
    };

    return (
        <div className="checkout-page" data-testid="checkout-page">
            <section className="section checkout-page-section">
                <div className="container">
                    <header className="checkout-page-header">
                        <h1>Checkout</h1>
                        <p className="checkout-page-subtitle">
                            Review your order and complete payment securely.
                        </p>
                    </header>
                    <div className="checkout-page-grid">
                        <div className="checkout-page-main">
                            <OrderSummaryCard
                                items={state.items}
                                imageBaseUrl={urlService.apiBaseUrl}
                                totals={totals}
                            />
                        </div>
                        <aside className="checkout-page-aside">
                            <StripePaymentCard>
                                {clientSecret ? (
                                    <Elements stripe={stripePromise} options={options} mode="payment">
                                        <CheckoutForm clientSecret={clientSecret} />
                                    </Elements>
                                ) : (
                                    <div className="checkout-page-stripe-placeholder">
                                        Payment details will appear once your order total is ready.
                                    </div>
                                )}
                            </StripePaymentCard>
                        </aside>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default CheckoutPage;
