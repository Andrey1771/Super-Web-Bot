import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Elements} from '@stripe/react-stripe-js';
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
import { createStripePromise } from '../../../utils/stripe-loader';

const stripePromise = createStripePromise('pk_test_51PYcsW2NLq3ZGHldXb1IU6dygsBlIXn9jw2jXaFCisQOE5RBfmvVF0phul3EDhFE8RPxgdLrd6K3s5lasn0l7Aqt00E0IpEiZW');

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
    const [paymentInitError, setPaymentInitError] = useState('');
    const hasTrackedCheckout = useRef(false);
    const [cryptoEnabled, setCryptoEnabled] = useState(false);
    const [cryptoBusy, setCryptoBusy] = useState(false);
    const [cryptoError, setCryptoError] = useState('');

    // Крипто-опция (BTCPay, testnet demo) показывается только если бэкенд сконфигурирован.
    useEffect(() => {
        apiClient.api.get('/api/payments/crypto/config')
            .then(({data}) => setCryptoEnabled(Boolean(data?.enabled)))
            .catch(() => setCryptoEnabled(false));
    }, [apiClient.api]);

    const handleCryptoPay = async () => {
        setCryptoBusy(true);
        setCryptoError('');
        try {
            const {data} = await apiClient.api.post('/api/payments/crypto/invoice', {
                subtotal: totals.subtotal,
                discountTotal: totals.discount,
                total: totals.total,
                items: state.items.map((item) => ({
                    productType: 'Game',
                    gameId: item.gameId,
                    title: item.name,
                    coverUrl: item.image,
                    quantity: item.quantity,
                    unitPrice: item.price,
                    discountPerUnit: 0,
                    finalUnitPrice: item.price,
                    lineTotal: item.price * item.quantity,
                })),
            });
            // Hosted checkout BTCPay; после оплаты вернёт на /checkout/success?crypto_invoice=<id>.
            window.location.href = data.checkoutLink;
        } catch (error: any) {
            setCryptoError(error?.response?.status === 401
                ? 'Please sign in to pay with crypto.'
                : 'Could not start crypto payment. Please try again.');
            setCryptoBusy(false);
        }
    };

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
                setPaymentInitError('');
                return;
            }

            try {
                setPaymentInitError('');
                const {data} = await apiClient.api.post('/api/payments/create-payment-intent', {
                    amount: Math.round(totals.total),
                    currency: 'USD',
                    promoCode: promoCode || undefined,
                    subtotal: totals.subtotal,
                    discountTotal: totals.discount,
                    taxTotal: 0,
                    total: totals.total,
                    items: state.items.map((item) => ({
                        productType: 'Game',
                        gameId: item.gameId,
                        title: item.name,
                        coverUrl: item.image,
                        quantity: item.quantity,
                        unitPrice: item.price,
                        discountPerUnit: 0,
                        finalUnitPrice: item.price,
                        lineTotal: item.price * item.quantity,
                    })),
                });
                setClientSecret(data.clientSecret ?? data.ClientSecret ?? null);
            } catch (error: any) {
                setClientSecret(null);
                setPaymentInitError(error?.response?.status === 401
                    ? 'Please sign in to continue with payment.'
                    : (error?.response?.data?.message ?? 'Unable to initialize payment. Please try again.'));
            }
        };

        fetchClientSecret();
    }, [apiClient.api, promoCode, state.items, totals.discount, totals.subtotal, totals.total]);

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
                                {clientSecret && stripePromise ? (
                                    <Elements stripe={stripePromise} options={options} mode="payment">
                                        <CheckoutForm clientSecret={clientSecret} />
                                    </Elements>
                                ) : (
                                    <div className="checkout-page-stripe-placeholder">
                                        {paymentInitError || !stripePromise
                                            ? (paymentInitError || 'Stripe is temporarily unavailable. Please try again later.')
                                            : 'Payment details will appear once your order total is ready.'}
                                    </div>
                                )}
                            </StripePaymentCard>

                            {cryptoEnabled && (
                                <div className="checkout-crypto-card">
                                    <div className="checkout-crypto-card__header">
                                        <h3>Pay with Bitcoin</h3>
                                        <span className="checkout-crypto-card__badge">Testnet demo</span>
                                    </div>
                                    <p className="checkout-crypto-card__hint">
                                        Demo integration via self-hosted BTCPay Server. Uses test coins only — no real funds.
                                    </p>
                                    <button
                                        type="button"
                                        className="checkout-crypto-card__button"
                                        onClick={handleCryptoPay}
                                        disabled={cryptoBusy || totals.total <= 0}
                                    >
                                        {cryptoBusy ? 'Opening BTCPay…' : '₿ Pay with Bitcoin (testnet)'}
                                    </button>
                                    {cryptoError && <p className="checkout-crypto-card__error">{cryptoError}</p>}
                                </div>
                            )}
                        </aside>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default CheckoutPage;
