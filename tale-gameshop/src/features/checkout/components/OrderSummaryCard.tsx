import React, {useMemo} from 'react';
import {Link} from 'react-router-dom';
import {Product} from '../../../reducers/cart-reducer';
import './order-summary-card.css';

type CheckoutTotals = {
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
};

type OrderSummaryCardProps = {
    items: Product[];
    imageBaseUrl: string;
    totals: CheckoutTotals;
};

const formatPrice = (value: number) => `$${value.toFixed(2)}`;

const normalizeImagePath = (imagePath: string) => imagePath.replace(/^\/?wwwroot\//, '/');

const resolveCoverUrl = (imageBaseUrl: string, imagePath?: string) => {
    if (!imagePath) {
        return '';
    }

    const normalizedPath = normalizeImagePath(imagePath);

    if (normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')) {
        return normalizedPath;
    }

    if (normalizedPath.startsWith('/')) {
        return `${imageBaseUrl}${normalizedPath}`;
    }

    return `${imageBaseUrl}/${normalizedPath}`;
};

const OrderSummaryCard: React.FC<OrderSummaryCardProps> = ({items, imageBaseUrl, totals}) => {
    const fallbackImage = useMemo(
        () =>
            'data:image/svg+xml;utf8,' +
            encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112">' +
                    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
                    '<stop offset="0%" stop-color="#d9d2ff"/><stop offset="100%" stop-color="#f8f6ff"/>' +
                    '</linearGradient></defs>' +
                    '<rect width="100%" height="100%" rx="16" fill="url(#g)"/>' +
                    '<text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-size="18" fill="#6f64a8">No image</text>' +
                '</svg>'
            ),
        []
    );

    return (
        <div className="card order-summary-card" data-testid="order-summary-card">
            <div className="order-summary-header">
                <div>
                    <h2>Order summary</h2>
                    <p>Check your items before completing payment.</p>
                </div>
                <span className="badge">Secure checkout</span>
            </div>
            <div className="order-summary-items">
                {items.length === 0 ? (
                    <div className="order-summary-empty">Your cart is empty.</div>
                ) : (
                    items.map((item) => {
                        const itemTotal = item.price * item.quantity;
                        const platform = (item as {platform?: string}).platform;
                        const region = (item as {region?: string}).region;
                        const coverUrl = resolveCoverUrl(imageBaseUrl, item.image);

                        return (
                            <div key={item.gameId} className="order-summary-item">
                                <div className="order-summary-item-media">
                                    <img
                                        src={coverUrl || fallbackImage}
                                        alt={item.name}
                                        onError={(event) => {
                                            event.currentTarget.onerror = null;
                                            event.currentTarget.src = fallbackImage;
                                        }}
                                    />
                                </div>
                                <div className="order-summary-item-content">
                                    <div className="order-summary-item-title">{item.name}</div>
                                    {(platform || region) && (
                                        <div className="order-summary-item-meta">
                                            {platform && <span className="badge">{platform}</span>}
                                            {region && <span className="badge">{region}</span>}
                                        </div>
                                    )}
                                    <div className="order-summary-item-qty">
                                        Qty {item.quantity} × {formatPrice(item.price)}
                                    </div>
                                </div>
                                <div className="order-summary-item-total">{formatPrice(itemTotal)}</div>
                            </div>
                        );
                    })
                )}
            </div>
            <div className="divider order-summary-divider" />
            <div className="order-summary-promo">
                <label htmlFor="promo-code" className="order-summary-label">
                    Promo code
                </label>
                <div className="order-summary-promo-row">
                    <input
                        id="promo-code"
                        className="input"
                        type="text"
                        placeholder="Enter promo code"
                        autoComplete="off"
                    />
                    {/* TODO: wire promo code validation */}
                    <button className="btn btn-outline" type="button" disabled>
                        Apply
                    </button>
                </div>
                <p className="order-summary-hint">You will receive keys instantly after successful payment.</p>
            </div>
            <div className="order-summary-totals">
                <div className="order-summary-line">
                    <span>Subtotal</span>
                    <span>{formatPrice(totals.subtotal)}</span>
                </div>
                {totals.discount > 0 && (
                    <div className="order-summary-line">
                        <span>Discount</span>
                        <span className="order-summary-discount">-{formatPrice(totals.discount)}</span>
                    </div>
                )}
                {totals.tax > 0 ? (
                    <div className="order-summary-line">
                        <span>Tax</span>
                        <span>{formatPrice(totals.tax)}</span>
                    </div>
                ) : (
                    <div className="order-summary-line order-summary-line-muted">
                        <span>Tax</span>
                        <span>Calculated at payment</span>
                    </div>
                )}
                <div className="order-summary-total">
                    <span>Total</span>
                    <span>{formatPrice(totals.total)}</span>
                </div>
            </div>
            <div className="order-summary-footer">
                <Link to="/cart" className="link-primary">
                    ← Back to cart
                </Link>
                <span className="order-summary-secure">Secure checkout — instant delivery</span>
            </div>
        </div>
    );
};

export default OrderSummaryCard;
