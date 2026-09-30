import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

/**
 * Посадочная после клика по ссылке «подтвердите почту» из письма (гостевая покупка).
 * Бэкенд (/api/payments/verify-delivery) уже сделал работу и редиректнул сюда со статусом:
 *   ok      — почта подтверждена, ключи отправлены письмом;
 *   pending — почта подтверждена, но пул ключей пуст — доложим письмом при пополнении;
 *   invalid — ссылка битая или истекла (48 часов).
 */
const DeliveryConfirmedPage: React.FC = () => {
    const { t } = useTranslation();
    const [params] = useSearchParams();
    const status = params.get('status') ?? 'invalid';
    const order = params.get('order');

    // Тексты — в словаре success.delivery.<status>{Title,Text}.
    const kind = status === 'ok' ? 'ok' : status === 'pending' ? 'pending' : status === 'refunded' ? 'refunded' : 'invalid';
    const view = { title: t(`success.delivery.${kind}Title`), text: t(`success.delivery.${kind}Text`) };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">{view.title}</h2>
                <p className="text-gray-600 mb-4">{view.text}</p>
                {order && <p className="text-gray-700 mb-6">{t('common.order', { id: order })}</p>}
                <div className="flex gap-3 justify-center flex-wrap">
                    <Link to="/games" className="px-6 py-3 bg-violet-600 text-white rounded-lg shadow hover:bg-violet-700">
                        {t('common.continueShopping')}
                    </Link>
                    {status === 'invalid' && (
                        <Link to="/support" className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg shadow hover:bg-gray-200">
                            {t('common.contactSupport')}
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeliveryConfirmedPage;
