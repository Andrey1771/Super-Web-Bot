import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';

/**
 * Посадочная после клика по ссылке «подтвердите почту» из письма (гостевая покупка).
 * Бэкенд (/api/payments/verify-delivery) уже сделал работу и редиректнул сюда со статусом:
 *   ok      — почта подтверждена, ключи отправлены письмом;
 *   pending — почта подтверждена, но пул ключей пуст — доложим письмом при пополнении;
 *   invalid — ссылка битая или истекла (48 часов).
 */
const DeliveryConfirmedPage: React.FC = () => {
    const [params] = useSearchParams();
    const status = params.get('status') ?? 'invalid';
    const order = params.get('order');

    const view = status === 'ok'
        ? {
            title: 'Email confirmed — keys sent!',
            text: 'Your game keys are on their way to your inbox. Keep that email safe and treat keys like cash.',
        }
        : status === 'pending'
            ? {
                title: 'Email confirmed',
                text: 'Your keys are temporarily out of stock. We will email them automatically as soon as they are available — no action needed.',
            }
            : status === 'refunded'
                ? {
                    title: 'This order was refunded',
                    text: 'The email was not confirmed in time, so the payment was returned to your card (usually within 5–10 business days). No keys were issued. If you still want the game, just place the order again.',
                }
                : {
                    title: 'This link is invalid or has expired',
                    text: 'Verification links are valid for 48 hours. If you believe this is a mistake, contact support with your order number.',
                };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">{view.title}</h2>
                <p className="text-gray-600 mb-4">{view.text}</p>
                {order && <p className="text-gray-700 mb-6">Order #{order}</p>}
                <div className="flex gap-3 justify-center flex-wrap">
                    <Link to="/games" className="px-6 py-3 bg-violet-600 text-white rounded-lg shadow hover:bg-violet-700">
                        Continue shopping
                    </Link>
                    {status === 'invalid' && (
                        <Link to="/support" className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg shadow hover:bg-gray-200">
                            Contact support
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeliveryConfirmedPage;
