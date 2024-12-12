import React from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import axios from "axios";

const stripePromise = loadStripe("pk_test_...");

const CheckoutForm: React.FC = () => {
    const stripe = useStripe();
    const elements = useElements();

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!stripe || !elements) return;

        // Получение client secret от сервера
        const { data } = await axios.post("/api/payments/create-payment-intent", {
            amount: 1000, // сумма в центах
        });

        const cardElement = elements.getElement(CardElement);

        const { error, paymentIntent } = await stripe.confirmCardPayment(data.ClientSecret, {
            payment_method: {
                card: cardElement!,
            },
        });

        if (error) {
            console.error(error.message);
        } else {
            console.log("Payment successful!", paymentIntent);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-md mx-auto p-4 border rounded">
            <CardElement className="p-2 border rounded bg-gray-50" />
            <button
                type="submit"
                disabled={!stripe}
                className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
                Pay
            </button>
        </form>
    );
};

const StripeContainer: React.FC = () => (
    <Elements stripe={stripePromise}>
        <CheckoutForm />
    </Elements>
);

export default StripeContainer;