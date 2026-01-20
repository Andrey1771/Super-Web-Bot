import React, {useEffect, useMemo, useState} from 'react';
import {Elements} from '@stripe/react-stripe-js';
import {loadStripe} from '@stripe/stripe-js';
import axios from "axios";
import {useCart} from '../../../context/cart-context';
import container from "../../../inversify.config";
import {IUrlService} from "../../../iterfaces/i-url-service";
import IDENTIFIERS from "../../../constants/identifiers";
import CheckoutForm from '../../payments/stripe-container/checkout-form';
import OrderSummaryCard from '../../../features/checkout/components/OrderSummaryCard';
import StripePaymentCard from '../../../features/checkout/components/StripePaymentCard';
import {calculateCheckoutTotals} from '../../../features/checkout/utils/checkout-totals';
import './checkout-page.css';


const CheckoutPage: React.FC = () => {
    const {state} = useCart();
    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    const totals = useMemo(() => calculateCheckoutTotals(state.items), [state.items]);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    useEffect(() => {
        (async () => {
            // Запрос на сервер для получения clientSecret TODO
            const {data} = await axios.post(`${urlService.apiBaseUrl}/api/payments/create-payment-intent`, {
                amount: totals.total, // сумма в центах
            });
            setClientSecret(data.clientSecret);
        })();
    }, [totals.total, urlService.apiBaseUrl]);

    const stripePromise = loadStripe('pk_test_51PYcsW2NLq3ZGHldXb1IU6dygsBlIXn9jw2jXaFCisQOE5RBfmvVF0phul3EDhFE8RPxgdLrd6K3s5lasn0l7Aqt00E0IpEiZW');

    const options = {
        // passing the client secret obtained in step 3
        clientSecret: clientSecret,
        // Fully customizable with appearance API.
        appearance: {/*...*/},
        requestPayerName: true,
        requestPayerEmail: true,
    };

    return (
        <section className="checkout-page section" data-testid="checkout-page">
            <div className="container">
                <header className="checkout-page-header">
                    <h1>Checkout</h1>
                    <p>Review your order and complete payment securely.</p>
                </header>
                <div className="checkout-page-grid">
                    <div className="checkout-page-main">
                        <OrderSummaryCard
                            items={state.items}
                            imageBaseUrl={urlService.apiBaseUrl}
                            totals={totals}
                        />
                    </div>
                    <div className="checkout-page-aside">
                        <StripePaymentCard>
                            {clientSecret ? (
                                <Elements stripe={stripePromise} options={options} mode={'payment'}>
                                    <CheckoutForm clientSecret={clientSecret}/>
                                </Elements>
                            ) : (
                                <div className="checkout-stripe-placeholder">Loading payment form…</div>
                            )}
                        </StripePaymentCard>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default CheckoutPage;
