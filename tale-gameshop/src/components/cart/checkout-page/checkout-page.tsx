import React, {useState, useRef, useEffect} from 'react';
import {useCart} from '../../../context/cart-context';
import CheckoutForm from '../../payments/stripe-container/checkout-form';
import axios from "axios";
import {Elements} from '@stripe/react-stripe-js';
import {loadStripe} from '@stripe/stripe-js';
import './checkout-page.css';
import webSettings from '../../../webSettings.json';


const CheckoutPage: React.FC = () => {
    const {state} = useCart();

    const totalPrice = state.items.reduce((total, item) => total + item.price * item.quantity, 0);
    const carouselRef = useRef<HTMLDivElement>(null);

    const [clientSecret, setClientSecret] = useState(null);
    useEffect(() => {
        (async () => {
            // Запрос на сервер для получения clientSecret TODO
            const {data} = await axios.post(`${webSettings.apiBaseUrl}/api/payments/create-payment-intent`, {
                amount: totalPrice, // сумма в центах
            });
            console.log(data);
            setClientSecret(data.clientSecret);
        })();
    }, []);

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
        <div className="checkout-page-container p-4 mx-auto flex justify-center w-full items-stretch">
            <div className="checkout-page-left-elements-container h-full flex justify-start flex-col">
                <h1 className="text-3xl font-bold mb-6">Checkout</h1>
                <h2 className="text-xl font-bold mb-4">Order Summary</h2>
                <div className="checkout-page-cart-elements mb-6">
                    <div className="w-full">
                        {state.items.map((item) => (
                            <div
                                key={item.gameId}
                                className="grid grid-cols-3 items-center p-2 border-b gap-4 text-center"
                            >
                                {/* Колонка с изображением и названием */}
                                <div className="flex items-center gap-4">
                                    <img
                                        src={`${webSettings.apiBaseUrl}/${item.image}`}
                                        alt={item.name}
                                        className="w-16 h-16 object-cover rounded"
                                    />
                                    <span className="truncate">{item.name}</span>
                                </div>

                                {/* Колонка с количеством и ценой */}
                                <div>
                                    <span>
                                        {item.quantity} x ${item.price.toFixed(2)}
                                    </span>
                                </div>

                                {/* Колонка с общей ценой */}
                                <div className="text-right">
                                    <span>${(item.price * item.quantity).toFixed(2)}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="text-lg font-bold flex justify-between mt-4">
                        <span>Total:</span>
                        <span>${totalPrice.toFixed(2)}</span>
                    </div>
                </div>
            </div>
            <div className="checkout-page-right-elements-container">
                <div className="margin-bottom-60px"></div>
                <h2 className="text-xl font-bold mb-4">Payment Method</h2>
                {clientSecret &&
                    <Elements stripe={stripePromise} options={options} mode={'payment'}>
                        <CheckoutForm clientSecret={clientSecret}/>
                    </Elements>
                }
            </div>
        </div>
    );
};

export default CheckoutPage;
