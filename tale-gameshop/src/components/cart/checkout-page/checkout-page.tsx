import {Trans, useTranslation} from 'react-i18next';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import { trackFunnelStep } from "../../../utils/funnel-tracking";
import { getAttribution } from "../../../utils/attribution";
import { gaItemVariant } from "../../../utils/item-list-tracking";
import { getAnonId } from "../../../hooks/use-blog-tracking";
import {Link, Navigate} from 'react-router-dom';
import {Elements} from '@stripe/react-stripe-js';
import {useKeycloak} from '@react-keycloak/web';
import {useCart} from '../../../context/cart-context';
import CheckoutForm, { type DeliveryConsentCopy } from '../../payments/stripe-container/checkout-form';
import './checkout-page.css';
import container from '../../../inversify.config';
import {IUrlService} from '../../../iterfaces/i-url-service';
import {IApiClient} from '../../../iterfaces/i-api-client';
import type {IKeycloakAuthService} from '../../../iterfaces/i-keycloak-auth-service';
import IDENTIFIERS from '../../../constants/identifiers';
import {useSitePreferences} from '../../../context/site-preferences';
import OrderSummaryCard from '../../../features/checkout/components/OrderSummaryCard';
import StripePaymentCard from '../../../features/checkout/components/StripePaymentCard';
import {calculateCheckoutTotals} from '../../../features/checkout/utils/checkout-totals';
import { analyticsClient } from '../../../utils/analytics-client';
import { checkCartRegions, type CartItemRegion } from '../../../api/regionApi';
import { apiErrorText, serverErrorText } from '../../../utils/api-error';
import { regionExclusionsText, regionSummaryText } from '../../../utils/region-text';
import { getStripe } from '../../../utils/stripe-loader';
import { buildStripeElementsOptions, stripeLocaleFor } from './stripe-elements-options';
import { useCashbackOffer } from '../../cashback/CashbackHints';
import { taxLabel } from '../../../utils/tax-label';



// Тема Stripe под бренд Tale Shop (фиолетовый, Inter). theme:'flat' убирает
// родные рамки Stripe — рамку рисует только наш контейнер, без вложенности.
// Сколько ждём ответа на создание платежа, прежде чем признать, что сервис не отвечает.
// Нормальный ответ укладывается в секунду; 20 с — заведомо аномалия, но с запасом на
// медленную сеть, чтобы не обрывать живой запрос.
const PAYMENT_INIT_TIMEOUT_MS = 20000;

const stripeAppearance = {
    theme: 'flat' as const,
    variables: {
        colorPrimary: '#7c3aed',
        colorText: '#0f172a',
        colorTextSecondary: '#4b5563',
        colorDanger: '#dc2626',
        fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif',
        borderRadius: '12px',
        spacingUnit: '4px',
    },
    rules: {
        '.Input': { border: '1px solid #e5e7eb', boxShadow: 'none', backgroundColor: '#ffffff' },
        '.Input:focus': { border: '1px solid #7c3aed', boxShadow: '0 0 0 3px rgba(124, 58, 237, 0.15)' },
        '.Tab': { border: '1px solid #e5e7eb', boxShadow: 'none' },
        '.Tab:hover': { color: '#7c3aed' },
        '.Tab--selected': { borderColor: '#7c3aed', boxShadow: '0 0 0 1px #7c3aed' },
        '.Block': { border: '1px solid #e5e7eb', boxShadow: 'none' },
    },
};

const CheckoutPage: React.FC = () => {
    const {t} = useTranslation();
    const {state} = useCart();
    const {keycloak, initialized} = useKeycloak();
    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
    const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);
    const isAuthenticated = Boolean(keycloak.authenticated);

    const handleLogin = () => keycloakAuthService.loginWithRedirect(keycloak, window.location.href);

    // Гостевая покупка: платить можно без аккаунта, ключи придут на этот email
    // после подтверждения (ссылка в письме). guestEmail — применённое значение,
    // по нему создаётся платёж; input — черновик, чтобы не дёргать API на каждый символ.
    const [guestEmailInput, setGuestEmailInput] = useState('');
    const [guestEmail, setGuestEmail] = useState('');
    const guestEmailValid = /^\S+@\S+\.\S+$/.test(guestEmailInput.trim());

    const [promoCode, setPromoCode] = useState('');
    const [promoDiscount, setPromoDiscount] = useState(0);
    const [promoMessage, setPromoMessage] = useState('');
    const [promoError, setPromoError] = useState('');
    const [applyingPromo, setApplyingPromo] = useState(false);

    // Клиентский расчёт остаётся ТОЛЬКО как превью до ответа сервера.
    // Авторитетные суммы приходят из create-payment-intent — сервер считает их по каталогу.
    const previewTotals = useMemo(() => calculateCheckoutTotals(state.items, promoDiscount), [state.items, promoDiscount]);
    const baseSubtotal = useMemo(() => calculateCheckoutTotals(state.items).subtotal, [state.items]);
    const [serverTotals, setServerTotals] = useState<{subtotal: number; discount: number; tax: number; taxLabel: string | null; total: number} | null>(null);
    const totals = serverTotals ?? previewTotals;

    // Оплата кэшбэком. Сколько списать, решает сервер при создании платежа (весь доступный баланс,
    // но картой не меньше минимума) — и ровно эту сумму вычитает из PaymentIntent. Экран показывает
    // его ответ, а не свой расчёт: итог на экране обязан совпадать с тем, что спишет Stripe.
    // Только демо (?demo=cashback) считает на месте: баланса на сервере там нет.
    const cashbackOffer = useCashbackOffer();
    const [payWithCashback, setPayWithCashback] = useState(false);
    const [serverCashback, setServerCashback] = useState<{available: number; applied: number} | null>(null);
    const cashbackApplied = cashbackOffer.isDemo
        ? (payWithCashback ? Math.round(Math.max(0, Math.min(cashbackOffer.available, totals.total - 0.5)) * 100) / 100 : 0)
        : (payWithCashback ? serverCashback?.applied ?? 0 : 0);
    const cashbackAvailable = cashbackOffer.isDemo ? cashbackOffer.available : serverCashback?.available ?? cashbackOffer.available;
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    // Сессия покупателя Stripe: с ней форма карты показывает сохранённые карты и галочку «сохранить». У гостя её нет.
    const [customerSessionClientSecret, setCustomerSessionClientSecret] = useState<string | null>(null);
    // Текст согласия на немедленную выдачу берём с сервера: он же его и сохранит,
    // поэтому показанное и записанное — один текст, а не две копии.
    const [deliveryConsent, setDeliveryConsent] = useState<DeliveryConsentCopy | null>(null);
    // Нужно ли подтверждать почту перед выдачей ключей: решает сервер (доверенные/уже
    // подтверждённые почты выдают ключи сразу). По умолчанию true — до ответа считаем, что нужно.
    const [requiresEmailVerification, setRequiresEmailVerification] = useState(true);
    const [paymentInitError, setPaymentInitError] = useState('');
    /**
     * Позиции, которые в стране покупателя не активируются.
     *
     * Сервер такой заказ и так отклонит при создании платежа, но узнать об этом отказом на
     * последнем шаге — худший из способов. Здесь то же самое сказано до оплаты и по-человечески:
     * какая именно игра, почему и что с этим делать.
     */
    const [blockedItems, setBlockedItems] = useState<CartItemRegion[]>([]);
    // Запрос создания платежа идёт прямо сейчас. Без этого флага нажатие «Continue to payment»
    // не меняло на экране ровным счётом ничего: clientSecret ещё пуст, ошибки ещё нет, и
    // рендерилась та же самая форма email. При медленном или зависшем ответе покупатель
    // видел застывший экран без единого признака, что что-то происходит.
    const [isCreatingPayment, setIsCreatingPayment] = useState(false);
    // Ручной повтор: эффект зависит от корзины и email, при неизменных данных сам не перезапустится.
    const [paymentRetry, setPaymentRetry] = useState(0);
    // Номер последнего запроса создания платежа. Запросы уходят на каждое изменение и возвращаются в любом порядке;
    // применяем только ответ на последний, иначе опоздавший старый ответ перерисовывал сумму и кэшбэк мигал.
    const paymentRequestSeq = useRef(0);
    const hasTrackedCheckout = useRef(false);
    const {currency, country, lang} = useSitePreferences();
    const [cryptoEnabled, setCryptoEnabled] = useState(false);
    /** Почему криптой заплатить нельзя именно сейчас — текст приходит с сервера. */
    const [cryptoUnavailableReason, setCryptoUnavailableReason] = useState('');
    const [cryptoBusy, setCryptoBusy] = useState(false);
    const [cryptoError, setCryptoError] = useState('');

    // Формулировку согласия на немедленную выдачу даёт сервер — он же её и сохранит.
    // Не пришла — платить не даём: это видно в форме оплаты.
    useEffect(() => {
        apiClient.api.get('/api/payments/delivery-consent')
            .then(({data}) => setDeliveryConsent({version: data.version, text: data.text}))
            .catch((error) => {
                console.error('Failed to load delivery consent copy', error);
                setDeliveryConsent(null);
            });
    }, [apiClient.api]);

    /**
     * Пишет согласие к текущему намерению платежа. Идентификатор намерения достаём из
     * clientSecret — отдельно его на клиенте не держат, а формат у Stripe стабильный.
     */
    const recordDeliveryConsent = useCallback(async (version: string) => {
        if (!clientSecret) {
            throw new Error('No payment intent to attach the consent to.');
        }
        await apiClient.api.post('/api/payments/delivery-consent', {
            paymentIntentId: clientSecret.split('_secret')[0],
            version
        });
    }, [apiClient.api, clientSecret]);

    // Способы оплаты спрашиваем у сервера вместе с валютой: рельс может быть настроен,
    // но не принимать выбранную валюту — крипто-инвойс, например, выставляется только
    // в базовой. Раньше здесь стоял флаг «крипта включена», ничего не знавший о валюте.
    useEffect(() => {
        apiClient.api.get(`/api/storefront/payment-methods?currency=${encodeURIComponent(currency)}`)
            .then(({data}) => {
                const methods: Array<{ method: string; available: boolean; reason?: string }> = data?.methods ?? [];
                const crypto = methods.find((item) => item.method === 'crypto');
                setCryptoEnabled(Boolean(crypto?.available));
                setCryptoUnavailableReason(crypto && !crypto.available ? crypto.reason ?? '' : '');
            })
            .catch(() => {
                // Сервер не ответил — прячем всё, кроме карт: предложить способ, который
                // не сработает, хуже, чем не предложить его вовсе.
                setCryptoEnabled(false);
                setCryptoUnavailableReason('');
            });
    }, [apiClient.api, currency]);

    /**
     * Дошли до денег: выбран способ оплаты и нажата кнопка. Это граница между «начал
     * оформлять» и «попытался заплатить» — без неё в отчётах не отличить того, кто передумал
     * на форме, от того, у кого не прошла карта.
     */
    const trackPaymentAttempt = (paymentType: 'card' | 'crypto') => {
        // Способ оплаты — родное поле этого события, отдельное своё для него не нужно:
        // лишнее имя события засоряет отчёты и ничего не добавляет.
        analyticsClient.trackEcommerce('add_payment_info', {
            currency,
            value: totals.total,
            payment_type: paymentType,
            items: state.items.map((item) => ({
                item_id: item.gameId,
                item_name: item.name,
                price: item.price,
                quantity: item.quantity,
            })),
        });
    };

    /**
     * Оплата не прошла. Своё событие, стандартного у Google нет: «передумал» и «не смог
     * заплатить» — разные беды, и лечатся они по-разному. Код причины идёт от Stripe как есть
     * (insufficient_funds, card_declined и подобные) — по нему видно, что чинить.
     */
    const trackPaymentFailed = (paymentType: 'card' | 'crypto', reason: string | null) => {
        analyticsClient.trackEvent('payment_failed', {
            payment_type: paymentType,
            reason: reason ?? 'unknown',
            value: totals.total,
            currency,
        });
    };

    const handleCryptoPay = async () => {
        setCryptoBusy(true);
        setCryptoError('');
        trackPaymentAttempt('crypto');
        try {
            // Как и в Stripe-чекауте: никаких сумм, сервер считает цену сам.
            const {data} = await apiClient.api.post('/api/payments/crypto/invoice', {
                promoCode: promoCode || undefined,
                // Валюта, а не суммы: цены сервер всё равно возьмёт из каталога.
                currency,
                items: state.items.map((item) => ({
                    gameId: item.gameId,
                    quantity: item.quantity,
                    editionCode: item.editionCode,
                    // Вариант ключа: по нему сервер посчитает цену и выдаст ключ из нужной партии.
                    offerKey: item.offerKey,
                })),
            });
            // Hosted checkout BTCPay; после оплаты вернёт на /checkout/success?crypto_invoice=<id>.
            window.location.href = data.checkoutLink;
        } catch (error: any) {
            setCryptoError(error?.response?.status === 401
                ? t('checkout.cryptoSignIn')
                : t('checkout.cryptoFailed'));
            setCryptoBusy(false);
            trackPaymentFailed('crypto', error?.response?.status === 401 ? 'not_authenticated' : 'invoice_failed');
        }
    };

    useEffect(() => {
        if (!hasTrackedCheckout.current && totals.total > 0 && state.items.length > 0) {
            // Тот же шаг в свою аналитику: её не режут блокировщики, и воронка не зависит от согласия на куки.
            trackFunnelStep("begin_checkout");
            analyticsClient.trackEcommerce('begin_checkout', {
                // Валюта покупателя, а не зашитый доллар: иначе аналитика показывала бы
                // выручку в USD по суммам, посчитанным в другой валюте.
                currency,
                value: totals.total,
                // Издание и регион ключа — как в add_to_cart и в purchase: без них один товар
                // назывался бы в отчёте по-разному на соседних шагах воронки.
                items: state.items.map((item) => ({
                    item_id: item.gameId,
                    item_name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    ...(item.category ? { item_category: item.category } : {}),
                    ...(gaItemVariant(item) ? { item_variant: gaItemVariant(item) } : {}),
                }))
            });
            hasTrackedCheckout.current = true;
        }
    }, [state.items, totals.total]);

    useEffect(() => {
        const ids = state.items.map((item) => item.gameId).filter(Boolean);
        if (ids.length === 0) {
            setBlockedItems([]);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const response = await checkCartRegions(ids);
                if (!cancelled) {
                    setBlockedItems(response.items.filter((item) => item.allowed === false));
                }
            } catch {
                // Проверка недоступна — не выдумываем запрет: чекаут всё равно проверит на сервере.
                if (!cancelled) {
                    setBlockedItems([]);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
        // Страна берётся из настроек сайта и уезжает в заголовке запроса — при её смене перепроверяем.
    }, [state.items, country]);

    useEffect(() => {
        const requestId = ++paymentRequestSeq.current;
        const isLatest = () => requestId === paymentRequestSeq.current;
        const fetchClientSecret = async () => {
            // Гость без введённого email: платёж ещё не создаём — в рендере форма email.
            if (!isAuthenticated && !guestEmail) {
                setClientSecret(null); setCustomerSessionClientSecret(null);
                setServerTotals(null);
                setPaymentInitError('');
                return;
            }

            if (state.items.length === 0) {
                setClientSecret(null); setCustomerSessionClientSecret(null);
                setServerTotals(null);
                setPaymentInitError('');
                return;
            }

            try {
                setPaymentInitError('');
                setIsCreatingPayment(true);
                // Шлём ТОЛЬКО что и сколько покупаем. Никаких сумм — их считает сервер по каталогу.
                // Идентификатор посетителя для аналитики: покупку отправляет сервер, а куки
                // Google он прочитать не может. Не получилось — оформление продолжается как есть.
                const analyticsClientId = await analyticsClient.getClientId();
                const {data} = await apiClient.api.post('/api/payments/create-payment-intent', {
                    analyticsClientId: analyticsClientId || undefined,
                    // Первое касание: без него в отчёте по каналам всё сольётся в «прямой заход».
                    attribution: getAttribution(),
                    // Свой идентификатор посетителя: связывает заказ с событиями воронки,
                    // и конверсия «начал оплату → заплатил» становится считаемой.
                    visitorId: getAnonId(),
                    promoCode: promoCode || undefined,
                    // Сумму кэшбэка не шлём — только желание оплатить им. Сколько можно, считает сервер.
                    useCashback: payWithCashback && !cashbackOffer.isDemo && cashbackOffer.enabled,
                    email: isAuthenticated ? undefined : guestEmail,
                    // Валюта покупателя: суммы сервер посчитает сам по каталогу в ней же.
                    currency,
                    items: state.items.map((item) => ({
                        gameId: item.gameId,
                        quantity: item.quantity,
                        editionCode: item.editionCode,
                        // Вариант ключа: по нему сервер посчитает цену и выдаст ключ из нужной партии.
                        offerKey: item.offerKey,
                    })),
                }, {
                    // Без таймаута зависший запрос не отваливается никогда: catch не срабатывает,
                    // экран остаётся в исходном виде, и покупатель не понимает, что всё встало.
                    timeout: PAYMENT_INIT_TIMEOUT_MS,
                });
                if (!isLatest()) {
                    return;
                }
                setClientSecret(data.clientSecret ?? data.ClientSecret ?? null);
                setCustomerSessionClientSecret(data.customerSessionClientSecret ?? data.CustomerSessionClientSecret ?? null);
                setRequiresEmailVerification(
                    Boolean(data.requiresEmailVerification ?? data.RequiresEmailVerification ?? true));

                const serverTotalsPayload = data.totals ?? data.Totals;
                if (serverTotalsPayload) {
                    // total сервер отдаёт уже за вычетом кэшбэка, а сводка вычитает кэшбэк сама —
                    // поэтому здесь храним итог ДО кэшбэка.
                    const serverCashbackApplied = Number(serverTotalsPayload.cashback ?? serverTotalsPayload.Cashback ?? 0);
                    const cashbackPayload = data.cashback ?? data.Cashback;
                    setServerCashback(cashbackPayload ? {
                        available: Number(cashbackPayload.available ?? cashbackPayload.Available ?? 0),
                        applied: serverCashbackApplied,
                    } : null);
                    setServerTotals({
                        subtotal: Number(serverTotalsPayload.subtotal ?? serverTotalsPayload.Subtotal ?? 0),
                        discount: Number(serverTotalsPayload.discount ?? serverTotalsPayload.Discount ?? 0),
                        // Налог внутри итога (цены с налогом) — только для строки «Incl. VAT 19%».
                        tax: Number(serverTotalsPayload.tax ?? serverTotalsPayload.Tax ?? 0),
                        taxLabel: (() => {
                            const taxPayload = data.tax ?? data.Tax;
                            return taxPayload ? taxLabel(taxPayload.type ?? taxPayload.Type, Number(taxPayload.ratePercent ?? taxPayload.RatePercent)) : null;
                        })(),
                        total: Number(serverTotalsPayload.total ?? serverTotalsPayload.Total ?? 0) + serverCashbackApplied,
                    });
                }
            } catch (error: any) {
                if (!isLatest()) {
                    return;
                }
                setClientSecret(null); setCustomerSessionClientSecret(null);
                setServerTotals(null);
                if (error?.code === 'ECONNABORTED') {
                    // Таймаут: сервер не ответил. Отдельный текст, потому что «попробуйте ещё раз»
                    // без объяснения выглядит как отказ платежа, хотя платёж даже не создавался.
                    setPaymentInitError(t('checkout.paymentTimeout'));
                } else if (error?.response?.status === 401) {
                    setPaymentInitError(t('checkout.paymentSignIn'));
                } else {
                    setPaymentInitError(serverErrorText(error, t('checkout.paymentInitFailed')));
                }
            } finally {
                if (isLatest()) {
                    setIsCreatingPayment(false);
                }
            }
        };

        fetchClientSecret();
        // Зависим только от корзины, промокода, применённого email гостя и счётчика ручного
        // повтора: суммы приходят ОТ сервера, держать их в зависимостях — значит зациклить запрос.
    // Переключатель кэшбэка тоже меняет сумму платежа — поэтому он в зависимостях.
    }, [apiClient.api, isAuthenticated, guestEmail, promoCode, state.items, paymentRetry, payWithCashback]);

    const handleApplyPromo = async () => {
        setApplyingPromo(true);
        setPromoError('');
        setPromoMessage('');
        try {
            const {data} = await apiClient.api.post('/api/promo/validate', { code: promoCode, cartSubtotal: baseSubtotal });
            // Текст промокода — по коду сообщения (messageCode): поле code занято самим промокодом.
            if (!data.valid) {
                setPromoDiscount(0);
                setPromoError(apiErrorText({ code: data.messageCode, message: data.message }, t('checkout.promoInvalid')));
                return;
            }

            setPromoCode(data.code || promoCode.trim().toUpperCase());
            setPromoDiscount(Number(data.discountAmount ?? 0));
            setPromoMessage(apiErrorText({ code: data.messageCode, message: data.message }, t('checkout.promoApplied')));
        } catch (error: any) {
            setPromoDiscount(0);
            setPromoError(serverErrorText(error, t('checkout.promoFailed')));
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

    // Чекаут без товаров бессмысленен (сумма $0, платить нечего) — отправляем в корзину,
    // у неё уже есть нормальное пустое состояние. Сюда же попадает возврат «назад»
    // после успешной оплаты: корзина к тому моменту очищена.
    // ВАЖНО: guard стоит ПОСЛЕ всех хуков (правило hooks), но ДО рендера.
    if (state.items.length === 0) {
        return <Navigate to="/cart" replace />;
    }

    const options = buildStripeElementsOptions({ clientSecret, customerSessionClientSecret, appearance: stripeAppearance, locale: stripeLocaleFor(lang) });

    return (
        <div className="checkout-page" data-testid="checkout-page">
            <section className="section checkout-page-section">
                <div className="container">
                    <header className="checkout-page-header">
                        <h1>{t('checkout.title')}</h1>
                        <p className="checkout-page-subtitle">{t('checkout.subtitle')}</p>
                    </header>
                    {blockedItems.length > 0 && (
                        <div className="checkout-region-warning" role="alert">
                            <span className="checkout-region-warning-icon">!</span>
                            <div>
                                <strong>{t('checkout.blockedTitle')}</strong>
                                <ul>
                                    {blockedItems.map((blocked) => {
                                        const line = state.items.find((item) => item.gameId === blocked.gameId);
                                        return (
                                            <li key={blocked.gameId}>
                                                {line?.name ?? t('checkout.item')}
                                                {/* Под запретом важна причина: «Not in RU» объясняет, а «Activates
                                                    worldwide» рядом с заголовком «не активируется» противоречит ему. */}
                                                {regionExclusionsText(blocked) ?? regionSummaryText(blocked) ? ` — ${regionExclusionsText(blocked) ?? regionSummaryText(blocked)}` : ''}
                                            </li>
                                        );
                                    })}
                                </ul>
                                <p>
                                    {t('checkout.blockedTextBefore')}<Link to="/cart">{t('checkout.blockedCart')}</Link>{t('checkout.blockedTextAfter')}
                                </p>
                            </div>
                        </div>
                    )}

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
                                // Программа выключена — ни переключателя оплаты кэшбэком, ни обещания «вернётся».
                                cashback={cashbackOffer.ready && cashbackOffer.enabled ? {
                                    member: cashbackOffer.member,
                                    tier: cashbackOffer.tier,
                                    available: cashbackAvailable,
                                    applied: cashbackApplied,
                                    on: payWithCashback,
                                    onToggle: setPayWithCashback,
                                    onSignIn: handleLogin,
                                } : undefined}
                            />
                        </div>
                        <aside className="checkout-page-aside">
                            <StripePaymentCard>
                                {initialized && !isAuthenticated && !clientSecret && !paymentInitError ? (
                                    <div className="checkout-guest">
                                        <h3>{t('checkout.guestTitle')}</h3>
                                        <p>{t('checkout.guestText')}</p>
                                        <p><strong>{t('checkout.guestCheck')}</strong>{t('checkout.guestCheckText')}</p>
                                        <label className="checkout-guest-label" htmlFor="guest-email">{t('common.email')}</label>
                                        <input
                                            id="guest-email"
                                            className="input"
                                            type="email"
                                            autoComplete="email"
                                            placeholder="you@example.com"
                                            value={guestEmailInput}
                                            onChange={(event) => setGuestEmailInput(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' && guestEmailValid) {
                                                    setGuestEmail(guestEmailInput.trim());
                                                }
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            disabled={!guestEmailValid || isCreatingPayment}
                                            aria-busy={isCreatingPayment}
                                            onClick={() => setGuestEmail(guestEmailInput.trim())}
                                        >
                                            {isCreatingPayment ? t('checkout.preparing') : t('checkout.continueToPayment')}
                                        </button>
                                        <div className="checkout-guest-divider"><span>{t('common.or')}</span></div>
                                        <button type="button" className="btn btn-outline" onClick={handleLogin}>
                                            {t('checkout.signInHaveAccount')}
                                        </button>
                                    </div>
                                ) : clientSecret && getStripe() ? (
                                    <>
                                        {!isAuthenticated && (
                                            <p className="checkout-guest-note">
                                                {requiresEmailVerification
                                                    ? <Trans i18nKey="checkout.keysSentAfterConfirm" values={{email: guestEmail}} components={{b: <strong />}} />
                                                    : <Trans i18nKey="checkout.keysSentAfterPayment" values={{email: guestEmail}} components={{b: <strong />}} />}
                                                {' '}
                                                <button
                                                    type="button"
                                                    className="checkout-guest-change"
                                                    onClick={() => { setGuestEmail(''); setClientSecret(null); setCustomerSessionClientSecret(null); }}
                                                >
                                                    {t('checkout.changeEmail')}
                                                </button>
                                            </p>
                                        )}
                                        {/* key: секрет намерения и сессию покупателя после создания формы Stripe менять не даёт — новое намерение = новая форма. */}
                                        <Elements key={clientSecret} stripe={getStripe()} options={options}>
                                            <CheckoutForm
                                                clientSecret={clientSecret}
                                                consent={deliveryConsent}
                                                onRecordConsent={recordDeliveryConsent}
                                                onPaymentAttempt={() => trackPaymentAttempt('card')}
                                                onPaymentFailed={(code) => trackPaymentFailed('card', code)}
                                            />
                                        </Elements>
                                    </>
                                ) : (
                                    <div className="checkout-page-stripe-placeholder">
                                        {paymentInitError ? (
                                            <>
                                                <span>{paymentInitError}</span>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline checkout-retry"
                                                    onClick={() => setPaymentRetry((n) => n + 1)}
                                                >
                                                    {t('common.tryAgain')}
                                                </button>
                                            </>
                                        ) : !getStripe() ? (
                                            t('checkout.stripeUnavailable')
                                        ) : isCreatingPayment ? (
                                            t('checkout.preparing')
                                        ) : (
                                            t('checkout.waitingTotal')
                                        )}
                                    </div>
                                )}
                            </StripePaymentCard>

                            {!cryptoEnabled && cryptoUnavailableReason && (
                                // Рельс есть, но не для этой валюты. Молча прятать нельзя:
                                // покупатель, приходивший за криптой, решит, что она пропала.
                                <p className="checkout-crypto-card__hint">{cryptoUnavailableReason}</p>
                            )}

                            {cryptoEnabled && (
                                <div className="checkout-crypto-card">
                                    <div className="checkout-crypto-card__header">
                                        <h3>{t('checkout.cryptoTitle')}</h3>
                                        <span className="checkout-crypto-card__badge">{t('checkout.testnetDemo')}</span>
                                    </div>
                                    <p className="checkout-crypto-card__hint">{t('checkout.cryptoHint')}</p>
                                    <button
                                        type="button"
                                        className="checkout-crypto-card__button"
                                        onClick={handleCryptoPay}
                                        disabled={cryptoBusy || totals.total <= 0}
                                    >
                                        {cryptoBusy ? t('checkout.openingBtcpay') : t('checkout.payWithBitcoin')}
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
