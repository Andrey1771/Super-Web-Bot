import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import container from '../../../inversify.config';
import IDENTIFIERS from '../../../constants/identifiers';
import type { IApiClient } from '../../../iterfaces/i-api-client';
import { useCart } from '../../../context/cart-context';

const SuccessPurchasePage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const paymentIntentId = useMemo(() => searchParams.get('payment_intent') ?? '', [searchParams]);
    const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    const { dispatch } = useCart();

    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('Finalizing your order...');
    const [orderId, setOrderId] = useState<string | null>(null);

    useEffect(() => {
        if (!paymentIntentId) {
            setStatus('error');
            setMessage('Payment completed, but payment intent was not found in URL.');
            return;
        }

        const finalize = async () => {
            setStatus('loading');
            try {
                const { data } = await apiClient.api.post('/api/payments/confirm-payment-intent', {
                    paymentIntentId,
                });

                setOrderId(data.orderId ?? null);
                setStatus('success');
                setMessage('Payment successful. Your order has been added to account orders.');
                dispatch({ type: 'CLEAR_CART' });
            } catch (error: any) {
                setStatus('error');
                setMessage(error?.response?.data?.message ?? error?.response?.data ?? 'Payment was successful, but failed to finalize order.');
            }
        };

        finalize();
    }, [apiClient.api, dispatch, paymentIntentId]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Payment successful</h2>
                <p className="text-gray-600 mb-4">{message}</p>
                {orderId && <p className="text-gray-700 mb-6">Order #{orderId}</p>}
                <div className="flex gap-3 justify-center">
                    <Link to="/account/orders" className="px-6 py-3 bg-violet-600 text-white rounded-lg shadow hover:bg-violet-700">
                        Go to Orders
                    </Link>
                    <Link to="/games" className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg shadow hover:bg-gray-200">
                        Continue shopping
                    </Link>
                </div>
                {status === 'loading' && <p className="text-sm text-gray-500 mt-4">Please wait...</p>}
            </div>
        </div>
    );
};

export default SuccessPurchasePage;
