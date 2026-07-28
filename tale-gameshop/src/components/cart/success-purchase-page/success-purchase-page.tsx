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
    const cryptoInvoiceId = useMemo(() => searchParams.get('crypto_invoice') ?? '', [searchParams]);
    const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    const { dispatch } = useCart();
    const hasConfirmed = useRef(false);

    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('Finalizing your order...');
    const [orderId, setOrderId] = useState<string | null>(null);
    const [traceId, setTraceId] = useState<string | null>(null);
    // Гость: ключи придут после подтверждения почты — показываем кнопку «выслать письмо ещё раз».
    const [pendingVerification, setPendingVerification] = useState(false);
    const [buyerEmail, setBuyerEmail] = useState<string | null>(null);
    const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

    // Крипто-ветка (BTCPay): заказ создаёт вебхук, мы поллим статус до подтверждения.
    useEffect(() => {
        if (!cryptoInvoiceId) {
            return;
        }

        let cancelled = false;
        let attempts = 0;
        const maxAttempts = 40; // ~2 минуты по 3 секунды

        setStatus('loading');
        setMessage('Waiting for the crypto payment to settle (testnet demo)...');

        const poll = async () => {
            attempts += 1;
            try {
                const { data } = await apiClient.api.get(`/api/payments/crypto/status/${cryptoInvoiceId}`);
                if (cancelled) return;
                if (data?.settled) {
                    setOrderId(data.orderId ?? null);
                    setStatus('success');
                    setMessage('Crypto payment settled. Your order has been added to account orders.');
                    dispatch({ type: 'CLEAR_CART' });
                    return;
                }
            } catch (error) {
                if (process.env.NODE_ENV === 'development') {
                    console.error('Crypto status poll failed:', error);
                }
            }

            if (!cancelled && attempts < maxAttempts) {
                setTimeout(poll, 3000);
            } else if (!cancelled) {
                setStatus('error');
                setMessage('Payment is still settling. Check your orders in a few minutes or contact support.');
            }
        };

        poll();
        return () => { cancelled = true; };
    }, [apiClient.api, cryptoInvoiceId, dispatch]);

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
            // Гостевая покупка: ключи придержаны до подтверждения почты (ссылка в письме).
            setPendingVerification(Boolean(data.requiresEmailVerification));
            setBuyerEmail(data.buyerEmail ?? null);
            setMessage(data.requiresEmailVerification
                ? 'Payment received! One step left — confirm your email to get the keys.'
                : 'Payment successful. Your order has been added to account orders.');
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

    // «Не пришло письмо?» — новое письмо с новым токеном (старый живёт 48ч).
    // Сервер шлёт только на адрес из заказа и держит кулдаун 60 секунд.
    const handleResendVerification = useCallback(async () => {
        if (!paymentIntentId || resendState === 'sending') {
            return;
        }
        setResendState('sending');
        try {
            await apiClient.api.post('/api/payments/resend-verification', { paymentIntentId });
            setResendState('sent');
        } catch {
            setResendState('error');
        }
    }, [apiClient.api, paymentIntentId, resendState]);

    useEffect(() => {
        if (cryptoInvoiceId) {
            return; // крипто-флоу обрабатывается своим эффектом выше
        }

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
    }, [finalizeOrder, paymentIntentId, cryptoInvoiceId]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    {status === 'error' ? 'Order finalization issue' : 'Payment successful'}
                </h2>
                <p className="text-gray-600 mb-4">{message}</p>
                {traceId && <p className="text-xs text-gray-500 mb-3">Reference: {traceId}</p>}
                {orderId && <p className="text-gray-700 mb-6">Order #{orderId}</p>}
                {pendingVerification && status === 'success' && (
                    <div className="mb-4 rounded-lg bg-violet-50 border border-violet-200 p-4 text-sm text-gray-700 text-left space-y-2">
                        {buyerEmail && (
                            <p>We sent a confirmation link to <strong className="text-gray-900">{buyerEmail}</strong>.</p>
                        )}
                        <p>It usually arrives <strong>within 1–2 minutes</strong>. Nothing after 10 minutes? Check your spam folder, then resend:</p>
                        <button
                            type="button"
                            className="px-4 py-2 bg-white border border-violet-300 text-violet-700 rounded-lg shadow-sm hover:bg-violet-100 disabled:opacity-60"
                            onClick={handleResendVerification}
                            disabled={resendState === 'sending' || resendState === 'sent'}
                        >
                            {resendState === 'sent' ? 'Email sent again ✓'
                                : resendState === 'sending' ? 'Sending…'
                                : resendState === 'error' ? 'Failed — try again'
                                : 'Resend confirmation email'}
                        </button>
                        <p className="pt-1 border-t border-violet-200">
                            <strong>Save your order number</strong> (shown above) — support will ask for it.
                            Entered a wrong email? Contact support with the order number: we'll re-send the
                            confirmation to the correct address or refund you — keys are never released until
                            the email is confirmed.
                        </p>
                        <p className="text-xs text-gray-500">
                            Orders left unconfirmed for 48 hours are cancelled and fully refunded automatically.
                        </p>
                    </div>
                )}
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
                            onClick={() => (cryptoInvoiceId ? window.location.reload() : finalizeOrder(true))}
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
