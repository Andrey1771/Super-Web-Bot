import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Elements} from '@stripe/react-stripe-js';
import {loadStripe} from '@stripe/stripe-js';
import {useCart} from '../../../context/cart-context';
import CheckoutForm from '../../payments/stripe-container/checkout-form';
import './checkout-page.css';
import container from '../../../inversify.config';
import {IUrlService} from '../../../iterfaces/i-url-service';
import {IApiClient} from '../../../iterfaces/i-api-client';
import IDENTIFIERS from '../../../constants/identifiers';
import OrderSummaryCard from '../../../features/checkout/components/OrderSummaryCard';
import StripePaymentCard from '../../../features/checkout/components/StripePaymentCard';
import {calculateCheckoutTotals} from '../../../features/checkout/utils/checkout-totals';
import { analyticsClient } from '../../../utils/analytics-client';

const stripePromise = loadStripe('pk_test_51PYcsW2NLq3ZGHldXb1IU6dygsBlIXn9jw2jXaFCisQOE5RBfmvVF0phul3EDhFE8RPxgdLrd6K3s5lasn0l7Aqt00E0IpEiZW');

const CheckoutPage: React.FC = () => {
    const {state} = useCart();
    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
    const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);

    const [promoCode, setPromoCode] = useState('');
    const [promoDiscount, setPromoDiscount] = useState(0);
    const [promoMessage, setPromoMessage] = useState('');
    const [promoError, setPromoError] = useState('');
    const [applyingPromo, setApplyingPromo] = useState(false);

    const totals = useMemo(() => calculateCheckoutTotals(state.items, promoDiscount), [state.items, promoDiscount]);
    const baseSubtotal = useMemo(() => calculateCheckoutTotals(state.items).subtotal, [state.items]);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const hasTrackedCheckout = useRef(false);

    useEffect(() => {
        if (!hasTrackedCheckout.current && totals.total > 0 && state.items.length > 0) {
            analyticsClient.trackEcommerce('begin_checkout', {
                currency: 'USD',
                value: totals.total,
                items: state.items.map((item) => ({ item_id: item.gameId, item_name: item.name, price: item.price, quantity: item.quantity }))
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

            const {data} = await apiClient.api.post('/api/payments/create-payment-intent', {
                amount: Math.round(totals.total),
                currency: 'USD',
                promoCode: promoCode || undefined,
                items: state.items.map((item) => ({
                    gameId: item.gameId,
                    title: item.name,
                    quantity: item.quantity,
                    unitPrice: item.price,
                })),
            });
            setClientSecret(data.clientSecret ?? data.ClientSecret);
        };

        fetchClientSecret();
    }, [apiClient.api, promoCode, state.items, totals.total]);

    const handleApplyPromo = async () => {
        setApplyingPromo(true);
        setPromoError('');
        setPromoMessage('');
        try {
            const {data} = await apiClient.api.post('/api/promo/validate', { code: promoCode, cartSubtotal: baseSubtotal });
            if (!data.valid) {
                setPromoDiscount(0);
                setPromoError(data.message || 'Promo code is invalid.');
                return;
            }

            setPromoCode(data.code || promoCode.trim().toUpperCase());
            setPromoDiscount(Number(data.discountAmount ?? 0));
            setPromoMessage(data.message || 'Promo code applied.');
        } catch (error: any) {
            setPromoDiscount(0);
            setPromoError(error?.response?.data?.message ?? 'Failed to apply promo code.');
        } finally {
            setApplyingPromo(false);
        }
    };

    const handleRemovePromo = () => {
        setPromoDiscount(0);
        setPromoMessage('');
        setPromoError('');
        setPromoCode('');
    };

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
                        <p className="checkout-page-subtitle">Review your order and complete payment securely.</p>
                    </header>
                    <div className="checkout-page-grid">
                        <div className="checkout-page-main">
                            <OrderSummaryCard
                                items={state.items}
                                imageBaseUrl={urlService.apiBaseUrl}
                                totals={totals}
                                promo={{ code: promoCode, message: promoMessage, error: promoError, discountAmount: promoDiscount, applying: applyingPromo }}
                                onPromoCodeChange={setPromoCode}
                                onApplyPromo={handleApplyPromo}
                                onRemovePromo={handleRemovePromo}
                            />
                        </div>
                        <aside className="checkout-page-aside">
                            <StripePaymentCard>
                                {clientSecret ? (
                                    <Elements stripe={stripePromise} options={options} mode="payment">
                                        <CheckoutForm clientSecret={clientSecret} />
                                    </Elements>
                                ) : (
                                    <div className="checkout-page-stripe-placeholder">Payment details will appear once your order total is ready.</div>
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
