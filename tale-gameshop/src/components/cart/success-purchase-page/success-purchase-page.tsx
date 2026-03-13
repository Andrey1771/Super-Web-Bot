import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import container from '../../../inversify.config';
import IDENTIFIERS from '../../../constants/identifiers';
import type { IApiClient } from '../../../iterfaces/i-api-client';
import { useCart } from '../../../context/cart-context';

type FinalizeErrorPayload = {
    message?: string;
    traceId?: string;
    code?: string;
};

const SuccessPurchasePage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const paymentIntentId = useMemo(() => searchParams.get('payment_intent') ?? '', [searchParams]);
    const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    const { dispatch } = useCart();
    const hasConfirmed = useRef(false);

    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('Finalizing your order...');
    const [orderId, setOrderId] = useState<string | null>(null);
    const [traceId, setTraceId] = useState<string | null>(null);

    const finalizeOrder = useCallback(async (manualRetry = false) => {
        if (!paymentIntentId) {
            setStatus('error');
            setMessage('Payment completed, but payment intent was not found in URL.');
            return;
        }

        if (!manualRetry && hasConfirmed.current) {
            return;
        }

        hasConfirmed.current = true;
        setStatus('loading');
        setTraceId(null);

        try {
            const { data } = await apiClient.api.post('/api/payments/confirm-payment-intent', {
                paymentIntentId,
            });

            setOrderId(data.orderId ?? null);
            setStatus('success');
            setMessage('Payment successful. Your order has been added to account orders.');
            dispatch({ type: 'CLEAR_CART' });

            if (typeof window !== 'undefined') {
                sessionStorage.setItem(`payment-finalized:${paymentIntentId}`, data.orderId ?? 'true');
            }
        } catch (error: any) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to finalize payment intent:', error);
            }

            const payload = error?.response?.data as FinalizeErrorPayload | undefined;
            setTraceId(payload?.traceId ?? null);
            setStatus('error');
            setMessage("We couldn't finalize your order. Your payment may still be pending. Please try again or contact support.");
        }
    }, [apiClient.api, dispatch, paymentIntentId]);

    useEffect(() => {
        if (!paymentIntentId) {
            setStatus('error');
            setMessage('Payment completed, but payment intent was not found in URL.');
            return;
        }

        const finalizedKey = typeof window !== 'undefined'
            ? sessionStorage.getItem(`payment-finalized:${paymentIntentId}`)
            : null;

        if (finalizedKey) {
            setStatus('success');
            setOrderId(finalizedKey === 'true' ? null : finalizedKey);
            setMessage('Payment successful. Your order has already been finalized.');
            return;
        }

        finalizeOrder(false);
    }, [finalizeOrder, paymentIntentId]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    {status === 'error' ? 'Order finalization issue' : 'Payment successful'}
                </h2>
                <p className="text-gray-600 mb-4">{message}</p>
                {traceId && <p className="text-xs text-gray-500 mb-3">Reference: {traceId}</p>}
                {orderId && <p className="text-gray-700 mb-6">Order #{orderId}</p>}
                <div className="flex gap-3 justify-center flex-wrap">
                    <Link to="/account/orders" className="px-6 py-3 bg-violet-600 text-white rounded-lg shadow hover:bg-violet-700">
                        Go to Orders
                    </Link>
                    <Link to="/games" className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg shadow hover:bg-gray-200">
                        Continue shopping
                    </Link>
                    {status === 'error' && (
                        <button
                            type="button"
                            className="px-6 py-3 bg-amber-100 text-amber-800 rounded-lg shadow hover:bg-amber-200"
                            onClick={() => finalizeOrder(true)}
                        >
                            Try again
                        </button>
                    )}
                </div>
                {status === 'loading' && <p className="text-sm text-gray-500 mt-4">Please wait...</p>}
            </div>
        </div>
    );
};

export default SuccessPurchasePage;
