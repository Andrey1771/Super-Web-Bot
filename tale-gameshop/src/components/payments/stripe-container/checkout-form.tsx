import React, {useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import i18n from '../../../i18n';
import {
    useStripe,
    useElements,
    PaymentElement,
    ExpressCheckoutElement
} from '@stripe/react-stripe-js';
import { Link } from 'react-router-dom';
import {StripePaymentElementOptions} from '@stripe/stripe-js';

/** Текст согласия приходит с сервера — показываем дословно то, что он и сохранит. */
export interface DeliveryConsentCopy {
    version: string;
    text: string;
}

interface CheckoutFormProps {
    clientSecret: string;
    /**
     * Согласие на немедленную выдачу ключей. null — сервер его не отдал; тогда платить
     * не даём: без записанного согласия покупка цифрового товара опирается на пустоту.
     */
    consent: DeliveryConsentCopy | null;
    /** Записать согласие на сервере. Бросает — платёж не начинаем. */
    onRecordConsent: (version: string) => Promise<void>;
    /** Покупатель нажал «оплатить»: аналитика чекаута знает, что с этим делать. */
    onPaymentAttempt?: () => void;
    /** Банк или Stripe отказали — с кодом причины, если он пришёл. */
    onPaymentFailed?: (code: string | null) => void;
}

/// Понятные причины отказа. Stripe присылает decline_code — он точнее общего сообщения
/// и объясняет покупателю, что именно делать дальше.
const DECLINE_REASONS: Record<string, string> = {
    // Тексты — в словаре checkout.decline.<код>; здесь только список известных кодов.
    insufficient_funds: 'insufficient_funds',
    lost_card: 'lost_card',
    stolen_card: 'stolen_card',
    expired_card: 'expired_card',
    incorrect_cvc: 'incorrect_cvc',
    incorrect_number: 'incorrect_number',
    card_velocity_exceeded: 'card_velocity_exceeded',
    processing_error: 'processing_error',
    do_not_honor: 'do_not_honor',
    generic_decline: 'generic_decline',
    authentication_required: 'authentication_required',
};

/// Приоритет: конкретная причина отказа → сообщение Stripe → общий текст.
const describeStripeError = (error: { code?: string; decline_code?: string; message?: string }): string => {
    const known = (error.decline_code && DECLINE_REASONS[error.decline_code])
        ?? (error.code && DECLINE_REASONS[error.code]);
    return known ? i18n.t(`checkout.decline.${known}`) : error.message ?? i18n.t('checkout.genericDecline');
};

const CheckoutForm: React.FC<CheckoutFormProps> = ({clientSecret, consent, onRecordConsent, onPaymentAttempt, onPaymentFailed}) => {
    const {t} = useTranslation();
    const stripe = useStripe();
    const elements = useElements();

    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasExpressMethods, setHasExpressMethods] = useState(false);
    const [consentGiven, setConsentGiven] = useState(false);
    // Согласие пишется на сервер перед самой оплатой, а не в момент галочки: галочку можно
    // поставить и уйти, а платёж без записанного согласия начинаться не должен.
    const recordedRef = useRef(false);

    const canPay = Boolean(consent) && consentGiven;

    /** Пишет согласие, если ещё не записано. false — не удалось, платить нельзя. */
    const ensureConsentRecorded = async (): Promise<boolean> => {
        if (recordedRef.current || !consent) {
            return recordedRef.current;
        }
        try {
            await onRecordConsent(consent.version);
            recordedRef.current = true;
            return true;
        } catch (error) {
            console.error('Failed to record delivery consent', error);
            setErrorMessage(t('checkout.consentSaveFailed'));
            return false;
        }
    };
    const publicAppUrl = window.__APP_CONFIG__?.publicAppUrl ?? window.location.origin;

    const handleSubmit = async (event: any) => {
        // We don't want to let default form submission happen here,
        // which would refresh the page.
        event.preventDefault();

        if (!stripe || !elements) {
            // Stripe.js hasn't yet loaded.
            // Make sure to disable form submission until Stripe.js has loaded.
            return;
        }

        setIsSubmitting(true);
        setErrorMessage(null);
        setErrorCode(null);

        if (!(await ensureConsentRecorded())) {
            setIsSubmitting(false);
            return;
        }

        onPaymentAttempt?.();

        const {error} = await stripe.confirmPayment({
            //`Elements` instance that was used to create the Payment Element
            elements,
            confirmParams: {
                return_url: `${publicAppUrl}/checkout/success`,
            },
        });


        if (error) {
            // Особый случай: платёж УЖЕ прошёл (двойная отправка, возврат «назад» на чекаут).
            // Показывать здесь ошибку нельзя — деньги списаны. Ведём на success-страницу,
            // она доведёт заказ до конца по тому же paymentIntentId.
            if (error.code === 'payment_intent_unexpected_state') {
                const paymentIntentId = clientSecret.split('_secret')[0];
                window.location.assign(`${publicAppUrl}/checkout/success?payment_intent=${paymentIntentId}`);
                return;
            }

            setErrorMessage(describeStripeError(error));
            setErrorCode(error.decline_code ?? error.code ?? null);
            setIsSubmitting(false);
            onPaymentFailed?.(error.decline_code ?? error.code ?? null);
        } else {
            // Your customer will be redirected to your `return_url`. For some payment
            // methods like iDEAL, your customer will be redirected to an intermediate
            // site first to authorize the payment, then redirected to the `return_url`.
        }
    };

    const handleConfirmExpressCheckout = async (event: any) => {
        // Быстрая оплата — тот же платёж, и согласие ей нужно такое же.
        if (!(await ensureConsentRecorded())) {
            return;
        }
        event.confirm();
    };

    const paymentElementOptions: StripePaymentElementOptions = {
        layout: "tabs"
    };

    return (
        <form onSubmit={handleSubmit} className="checkout-stripe-form">
            {/* Согласие стоит первым и выше всех кнопок оплаты: быстрая оплата списывает
                деньги в один тап, и подтверждение, спрятанное под ней, человек не увидит. */}
            {consent ? (
                <label className="checkout-consent">
                    <input
                        type="checkbox"
                        checked={consentGiven}
                        onChange={(event) => setConsentGiven(event.target.checked)}
                        data-testid="delivery-consent"
                    />
                    <span>{consent.text}</span>
                </label>
            ) : (
                <p className="checkout-consent-missing" role="alert">
                    {t('checkout.consentMissing')}
                </p>
            )}

            <div className="checkout-stripe-express" hidden={!hasExpressMethods || !canPay}>
                <ExpressCheckoutElement
                    onConfirm={handleConfirmExpressCheckout}
                    onReady={(event) => setHasExpressMethods(Boolean(event.availablePaymentMethods))}
                />
            </div>
            {hasExpressMethods && canPay && <div className="checkout-stripe-divider"><span>{t('checkout.orPayWithCard')}</span></div>}
            <PaymentElement options={paymentElementOptions}/>
            <button
                disabled={!stripe || isSubmitting || !canPay}
                className="btn btn-primary checkout-stripe-submit"
                data-testid="place-order-button"
                type="submit"
            >
                {isSubmitting ? t('common.processing') : t('checkout.placeOrder')}
            </button>
            <Link to="/checkout/cancel" className="btn btn-outline checkout-stripe-cancel">
                {t('common.cancel')}
            </Link>
            {errorMessage && (
                <div className="checkout-stripe-error" role="alert">
                    <span>{errorMessage}</span>
                    {errorCode && <span className="checkout-stripe-error__code">{t('checkout.errorCode', {code: errorCode})}</span>}
                </div>
            )}
        </form>
    );
};

export default CheckoutForm;
