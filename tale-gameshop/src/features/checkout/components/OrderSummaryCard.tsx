import {useTranslation} from 'react-i18next';
import React from 'react';
import {Link} from 'react-router-dom';
import {cartLineKey, Product} from '../../../reducers/cart-reducer';
import './order-summary-card.css';
import Cover from '../../../components/common/Cover';
import {useSitePreferences} from '../../../context/site-preferences';
import {productHref} from '../../../utils/software';
import {formatMoney} from '../../../utils/format-money';
import type {CashbackTier} from '../../../utils/cashback';
import {CheckoutCashbackBack, CheckoutCashbackToggle} from '../../../components/cashback/CashbackHints';

type CheckoutTotals = {
    subtotal: number;
    discount: number;
    /** Налог внутри итога — к total не прибавляется. */
    tax: number;
    taxLabel?: string | null;
    total: number;
};

type PromoState = {
    code: string;
    message: string;
    error: string;
    discountAmount: number;
    applying: boolean;
};

export type CheckoutCashbackView = {
    /** Вошёл (или демо) — есть баланс и свой уровень; гостю предлагаем войти. */
    member: boolean;
    tier: CashbackTier;
    available: number;
    /** Сколько кэшбэка списывается с этого заказа. */
    applied: number;
    on: boolean;
    onToggle: (next: boolean) => void;
    onSignIn: () => void;
};

type OrderSummaryCardProps = {
    /** Нет — блоков кэшбэка не показываем (Keycloak ещё не ответил). */
    cashback?: CheckoutCashbackView;
    items: Product[];
    imageBaseUrl: string;
    totals: CheckoutTotals;
    promo: PromoState;
    onPromoCodeChange: (value: string) => void;
    onApplyPromo: () => void;
    onRemovePromo: () => void;
};

const OrderSummaryCard: React.FC<OrderSummaryCardProps> = ({items, imageBaseUrl, totals, promo, onPromoCodeChange, onApplyPromo, onRemovePromo, cashback}) => {
    const {t} = useTranslation();
    // Итог в сводке обязан совпадать с суммой, которую сервер отдаст в PaymentIntent.
    const {currency} = useSitePreferences();
    const formatPrice = (value: number) => formatMoney(value, currency);
    const applied = cashback?.applied ?? 0;
    // Возврат считается с того, что платится деньгами: с части, оплаченной кэшбэком, кэшбэк не начисляется.
    const paid = Math.max(0, Math.round((totals.total - applied) * 100) / 100);
    const canUseCashback = Boolean(cashback?.member && cashback.available > 0 && totals.total > 0);

    return (
        <div className="card order-summary-card" data-testid="order-summary-card">
            <div className="order-summary-header"><div><h2>{t('cart.orderSummary')}</h2><p>{t('checkout.summaryText')}</p></div><span className="badge">{t('common.secureCheckout')}</span></div>
            <div className="order-summary-items">
                {items.length === 0 ? <div className="order-summary-empty">{t('checkout.cartEmpty')}</div> : items.map((item) => {
                    const itemTotal = item.price * item.quantity;
                    // Издание и регион ключа: две строки одной игры отличаются только этим, а
                    // платить покупатель будет прямо отсюда. Ключ строки — тоже по ним: по gameId
                    // у React выходили одинаковые ключи на разные товары.
                    const variant = [item.editionTitle, item.offerTitle].filter(Boolean).join(' · ');
                    // Обложка и название ведут к товару, как в корзине: перед оплатой хочется
                    // перепроверить, что берёшь. Обычные ссылки — работают «в новой вкладке» и «назад».
                    const href = productHref({slug: item.slug, name: item.name});
                    return <div key={cartLineKey(item)} className="order-summary-item">
                        <Link className="order-summary-item-media" to={href} aria-label={item.name}>
                            <Cover ratio="square" sizes="64px" src={item.image} title={item.name} baseUrl={imageBaseUrl} />
                        </Link>
                        <div className="order-summary-item-content"><div className="order-summary-item-title"><Link className="order-summary-item-link" to={href}>{item.name}</Link></div>{variant ? <div className="order-summary-item-variant">{variant}</div> : null}<div className="order-summary-item-qty">{t('checkout.qty', {count: item.quantity, price: formatPrice(item.price)})}</div></div>
                        <div className="order-summary-item-total">{formatPrice(itemTotal)}</div>
                    </div>;
                })}
            </div>
            <div className="divider order-summary-divider" />
            <div className="order-summary-promo">
                <label htmlFor="promo-code" className="order-summary-label">{t('cart.promoCode')}</label>
                <div className="order-summary-promo-row">
                    <input id="promo-code" className="input" type="text" placeholder={t('checkout.promoPlaceholder')} autoComplete="off" value={promo.code} onChange={(event) => onPromoCodeChange(event.target.value)} />
                    <button className="btn btn-outline" type="button" onClick={onApplyPromo} disabled={promo.applying || !promo.code.trim()}>{promo.applying ? t('common.applying') : t('common.apply')}</button>
                    {promo.discountAmount > 0 && <button className="btn btn-outline" type="button" onClick={onRemovePromo}>{t('common.remove')}</button>}
                </div>
                {promo.message && <p className="text-sm text-green-600 mt-2">{promo.message}</p>}
                {promo.error && <p className="text-sm text-red-600 mt-2">{promo.error}</p>}
            </div>
            {cashback && canUseCashback && (
                <CheckoutCashbackToggle
                    available={cashback.available}
                    applied={applied}
                    on={cashback.on}
                    onToggle={cashback.onToggle}
                    currency={currency}
                />
            )}
            <div className="order-summary-totals">
                <div className="order-summary-line"><span>{t('common.subtotal')}</span><span>{formatPrice(totals.subtotal)}</span></div>
                {totals.discount > 0 && <div className="order-summary-line"><span>{t('common.discount')}</span><span className="order-summary-discount">-{formatPrice(totals.discount)}</span></div>}
                {applied > 0 && <div className="order-summary-line"><span>{t('common.cashback')}</span><span className="cbh-minus">−{formatPrice(applied)}</span></div>}
                {/* Цены с налогом: строка поясняет, сколько его внутри, но в итог не прибавляется. */}
                {totals.tax > 0
                    ? <div className="order-summary-line order-summary-line-muted"><span>{t('checkout.inclTax', {tax: totals.taxLabel ?? t('common.tax').toLowerCase()})}</span><span>{formatPrice(totals.tax)}</span></div>
                    : <div className="order-summary-line order-summary-line-muted"><span>{t('common.tax')}</span><span>{t('common.includedInPrice')}</span></div>}
                <div className="order-summary-total"><span>{t('common.total')}</span><span>{formatPrice(paid)}</span></div>
                {cashback && paid > 0 && (
                    <CheckoutCashbackBack
                        member={cashback.member}
                        tier={cashback.tier}
                        paid={paid}
                        showBase={applied > 0}
                        currency={currency}
                        onSignIn={cashback.onSignIn}
                    />
                )}
            </div>
            <div className="order-summary-footer"><Link to="/cart" className="link-primary">{t('checkout.backToCart')}</Link><span className="order-summary-secure">{t('checkout.secureInstant')}</span></div>
        </div>
    );
};

export default OrderSummaryCard;
