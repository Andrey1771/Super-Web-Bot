import React from 'react';
import {Link} from 'react-router-dom';
import {Product} from '../../../reducers/cart-reducer';
import './order-summary-card.css';
import SafeGameImage from '../../../components/common/SafeGameImage';

type CheckoutTotals = {
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
};

type PromoState = {
    code: string;
    message: string;
    error: string;
    discountAmount: number;
    applying: boolean;
};

type OrderSummaryCardProps = {
    items: Product[];
    imageBaseUrl: string;
    totals: CheckoutTotals;
    promo: PromoState;
    onPromoCodeChange: (value: string) => void;
    onApplyPromo: () => void;
    onRemovePromo: () => void;
};

const formatPrice = (value: number) => `$${value.toFixed(2)}`;
const OrderSummaryCard: React.FC<OrderSummaryCardProps> = ({items, imageBaseUrl, totals, promo, onPromoCodeChange, onApplyPromo, onRemovePromo}) => {
    return (
        <div className="card order-summary-card" data-testid="order-summary-card">
            <div className="order-summary-header"><div><h2>Order summary</h2><p>Check your items before completing payment.</p></div><span className="badge">Secure checkout</span></div>
            <div className="order-summary-items">
                {items.length === 0 ? <div className="order-summary-empty">Your cart is empty.</div> : items.map((item) => {
                    const itemTotal = item.price * item.quantity;
                    return <div key={item.gameId} className="order-summary-item">
                        <div className="order-summary-item-media"><SafeGameImage src={item.image} gameTitle={item.name} baseUrl={imageBaseUrl} /></div>
                        <div className="order-summary-item-content"><div className="order-summary-item-title">{item.name}</div><div className="order-summary-item-qty">Qty {item.quantity} × {formatPrice(item.price)}</div></div>
                        <div className="order-summary-item-total">{formatPrice(itemTotal)}</div>
                    </div>;
                })}
            </div>
            <div className="divider order-summary-divider" />
            <div className="order-summary-promo">
                <label htmlFor="promo-code" className="order-summary-label">Promo code</label>
                <div className="order-summary-promo-row">
                    <input id="promo-code" className="input" type="text" placeholder="Enter promo code" autoComplete="off" value={promo.code} onChange={(event) => onPromoCodeChange(event.target.value)} />
                    <button className="btn btn-outline" type="button" onClick={onApplyPromo} disabled={promo.applying || !promo.code.trim()}>{promo.applying ? 'Applying...' : 'Apply'}</button>
                    {promo.discountAmount > 0 && <button className="btn btn-outline" type="button" onClick={onRemovePromo}>Remove</button>}
                </div>
                {promo.message && <p className="text-sm text-green-600 mt-2">{promo.message}</p>}
                {promo.error && <p className="text-sm text-red-600 mt-2">{promo.error}</p>}
            </div>
            <div className="order-summary-totals">
                <div className="order-summary-line"><span>Subtotal</span><span>{formatPrice(totals.subtotal)}</span></div>
                {totals.discount > 0 && <div className="order-summary-line"><span>Discount</span><span className="order-summary-discount">-{formatPrice(totals.discount)}</span></div>}
                <div className="order-summary-line order-summary-line-muted"><span>Tax</span><span>Calculated at payment</span></div>
                <div className="order-summary-total"><span>Total</span><span>{formatPrice(totals.total)}</span></div>
            </div>
            <div className="order-summary-footer"><Link to="/cart" className="link-primary">← Back to cart</Link><span className="order-summary-secure">Secure checkout — instant delivery</span></div>
        </div>
    );
};

export default OrderSummaryCard;
