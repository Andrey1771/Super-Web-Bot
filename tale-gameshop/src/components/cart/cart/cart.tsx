import React, {useEffect, useRef} from 'react';
import {useCart} from '../../../context/cart-context';
import {Link, useSearchParams} from "react-router-dom";
import container from "../../../inversify.config";
import {IUrlService} from "../../../iterfaces/i-url-service";
import {IApiClient} from "../../../iterfaces/i-api-client";
import IDENTIFIERS from "../../../constants/identifiers";
import {useRecommendations} from '../../../hooks/use-recommendations';
import RecommendationsSection from '../../../components/recommendations/recommendations-section';
import type {RecommendationItem} from '../../../models/recommendations';
import {analyticsClient} from '../../../utils/analytics-client';
import {
    faArrowRotateLeft,
    faBolt,
    faCartPlus,
    faCircleCheck,
    faShieldHalved
} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {Product} from "../../../reducers/cart-reducer";
import SafeGameImage from "../../common/SafeGameImage";
import {useSitePreferences} from "../../../context/site-preferences";
import {formatMoney} from "../../../utils/format-money";
import './cart.css';

type CartItemRowProps = {
    item: Product;
    onIncrease: (id: string) => void;
    onDecrease: (id: string) => void;
    onRemove: (id: string) => void;
    imageBaseUrl: string;
};

type OrderSummaryProps = {
    subtotal: number;
    total: number;
};

// Валюта приходит из настроек сайта, а не из символа в шаблоне: корзина обязана
// показывать ту же валюту, в которой сервер посчитает чекаут.
const formatPrice = (value: number, currency: string) => formatMoney(value, currency);

const PAYMENT_BADGES = ['Visa', 'Mastercard', 'PayPal', 'Apple Pay', 'Google Pay'];

const CartItemRow: React.FC<CartItemRowProps> = ({item, onIncrease, onDecrease, onRemove, imageBaseUrl}) => {
    const itemTotal = item.price * item.quantity;
    const {currency} = useSitePreferences();

    return (
        <div className="cart-item">
            <div className="cart-item-media">
                <SafeGameImage src={item.image} gameTitle={item.name} baseUrl={imageBaseUrl}/>
            </div>
            <div className="cart-item-body">
                <div className="cart-item-top">
                    <div>
                        <h3 className="cart-item-name">{item.name}</h3>
                        <p className="cart-item-meta">Platform: Steam · Region: Global · Edition: Standard</p>
                    </div>
                    <div className="cart-item-price">{formatPrice(itemTotal, currency)}</div>
                </div>
                <div className="cart-chips">
                    <span className="cart-chip"><FontAwesomeIcon icon={faBolt}/>Instant delivery</span>
                    <span className="cart-chip"><FontAwesomeIcon icon={faCircleCheck}/>Verified key</span>
                </div>
                <div className="cart-item-actions">
                    <div className="cart-item-links">
                        <button type="button" className="cart-item-link" onClick={() => onRemove(item.gameId)}>Remove</button>
                        <button type="button" className="cart-item-link">Save for later</button>
                    </div>
                    <div className="qty-control">
                        <button type="button" className="qty-btn" aria-label="Decrease quantity" onClick={() => onDecrease(item.gameId)}>−</button>
                        <span className="qty-value">{item.quantity}</span>
                        <button type="button" className="qty-btn" aria-label="Increase quantity" onClick={() => onIncrease(item.gameId)}>+</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const OrderSummary: React.FC<OrderSummaryProps> = ({subtotal, total}) => {
    const {currency} = useSitePreferences();

    return (
        <div className="card cart-summary">
            <div className="cart-summary-head">
                <h2>Order summary</h2>
                <span className="badge">Secure checkout</span>
            </div>
            <div className="cart-summary-lines">
                <div className="cart-summary-line"><span>Subtotal</span><strong>{formatPrice(subtotal, currency)}</strong></div>
                <div className="cart-summary-line cart-summary-line-muted"><span>Taxes &amp; promo</span><span>Calculated at checkout</span></div>
            </div>
            <div className="cart-summary-total">
                <span>Total</span>
                <span className="cart-summary-amount">{formatPrice(total, currency)}</span>
            </div>
            <div className="cart-summary-actions">
                <Link to="/checkout" className="btn btn-primary">Checkout</Link>
                <Link to="/" className="btn btn-outline">Continue shopping</Link>
            </div>
            <div className="cart-pay-badges">
                {PAYMENT_BADGES.map((label) => <span key={label} className="cart-pay-badge">{label}</span>)}
            </div>
        </div>
    );
};

const TrustStrip: React.FC = () => (
    <div className="card cart-trust">
        {[
            {icon: faBolt, title: 'Instant delivery', text: 'Your key arrives by email within minutes.'},
            {icon: faShieldHalved, title: 'Secure payments', text: 'Encrypted checkout powered by Stripe.'},
            {icon: faArrowRotateLeft, title: 'Refund policy', text: 'Full refunds available within 14 days.'},
        ].map((feature) => (
            <div key={feature.title} className="cart-trust-item">
                <span className="cart-trust-icon"><FontAwesomeIcon icon={feature.icon}/></span>
                <div className="cart-trust-text">
                    <h4>{feature.title}</h4>
                    <p>{feature.text}</p>
                </div>
            </div>
        ))}
    </div>
);

const RecommendedRow: React.FC = () => {
    const {
        items: recommended,
        isLoading: isRecommendationsLoading,
        error: recommendationsError,
        reload: reloadRecommendations
    } = useRecommendations(4);
    const {dispatch} = useCart();
    const {currency} = useSitePreferences();

    // Добавление в корзину — тот же контракт, что в GameCard: цена с учётом активной скидки.
    const handleAddRecommended = (game: RecommendationItem['game']) => {
        const regularPrice = Number.isFinite(game.price) ? Number(game.price) : 0;
        const finalPrice = Number.isFinite(game.finalPrice ?? game.price) ? Number(game.finalPrice ?? game.price) : regularPrice;

        dispatch({
            type: 'ADD_TO_CART',
            payload: {
                gameId: game.id ?? '',
                name: game.title ?? game.name,
                price: finalPrice,
                quantity: 1,
                image: game.imagePath
            } as Product,
        });

        analyticsClient.trackEcommerce('add_to_cart', {
            value: finalPrice,
            items: [{
                item_id: game.id ?? '',
                item_name: game.title,
                price: finalPrice,
                item_category: String(game.gameType),
                quantity: 1
            }]
        });
    };

    return (
        <div className="card">
            <div className="cart-recs-head">
                <h2>Recommended for you</h2>
                <Link to="/games" className="link-primary">View all →</Link>
            </div>
            <RecommendationsSection
                items={recommended}
                isLoading={isRecommendationsLoading}
                error={recommendationsError}
                onRetry={reloadRecommendations}
                emptyMessage="Add games to your wishlist or view a few games to get recommendations."
                listClassName="cart-recs-grid"
                renderSkeleton={(index) => <div key={`rec-skeleton-${index}`} className="cart-recs-skeleton"/>}
                renderItem={(item) => (
                    <div key={item.game.id ?? item.game.title} className="rec-card">
                        <div className="rec-card-media">
                            <SafeGameImage src={item.game.imagePath} gameTitle={item.game.title}/>
                        </div>
                        <div className="rec-card-body">
                            <h3 className="rec-card-title">{item.game.title}</h3>
                            <p className="rec-card-tag">Steam</p>
                            <div className="rec-card-foot">
                                <span className="rec-card-price">{formatPrice(Number(item.game.price), currency)}</span>
                                <button type="button" className="btn btn-outline" onClick={() => handleAddRecommended(item.game)}>
                                    <FontAwesomeIcon icon={faCartPlus}/>
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            />
        </div>
    );
};

const Cart: React.FC = () => {
    const {state, dispatch} = useCart();
    const [searchParams, setSearchParams] = useSearchParams();
    const seededRef = useRef<Set<string>>(new Set());

    const subtotal = state.items.reduce((total, item) => total + item.price * item.quantity, 0);
    const total = subtotal;
    const itemCount = state.items.length;

    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    // Deep-link из бота: /cart?add=<gameId> кладёт игру в корзину и убирает параметр из URL.
    useEffect(() => {
        const gameId = searchParams.get('add');
        if (!gameId || seededRef.current.has(gameId)) {
            return;
        }
        seededRef.current.add(gameId);

        (async () => {
            try {
                const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
                const {data} = await apiClient.api.get(`/api/game/${gameId}`);
                if (data?.id) {
                    dispatch({
                        type: 'ADD_TO_CART',
                        payload: {
                            gameId: data.id,
                            name: data.title ?? data.name ?? 'Game',
                            price: Number(data.finalPrice ?? data.price ?? 0),
                            quantity: 1,
                            image: data.imagePath ?? '',
                        },
                    });
                }
            } catch (error) {
                console.error('Failed to add game from deep-link', error);
            } finally {
                const next = new URLSearchParams(searchParams);
                next.delete('add');
                setSearchParams(next, {replace: true});
            }
        })();
    }, [searchParams, dispatch, setSearchParams]);

    const handleIncreaseQuantity = (id: string) => dispatch({type: 'INCREASE_QUANTITY', payload: id});
    const handleDecreaseQuantity = (id: string) => dispatch({type: 'DECREASE_QUANTITY', payload: id});

    return (
        <div className="cart-shell">
            <div className="cart-head">
                <div>
                    <p className="cart-eyebrow">Cart</p>
                    <h1 className="cart-title">Your cart</h1>
                    <p className="cart-sub">Digital keys delivered instantly</p>
                </div>
                <span className="badge">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
            </div>

            {state.items.length === 0 ? (
                <div className="card cart-empty">
                    <h3>Your cart is empty</h3>
                    <p>Add some games to unlock instant delivery and exclusive deals.</p>
                    <Link to="/" className="btn btn-primary">Continue shopping</Link>
                </div>
            ) : (
                <div className="cart-layout">
                    <div className="card cart-items-card">
                        {state.items.map((item) => (
                            <CartItemRow
                                key={item.gameId}
                                item={item}
                                imageBaseUrl={urlService.apiBaseUrl}
                                onIncrease={handleIncreaseQuantity}
                                onDecrease={handleDecreaseQuantity}
                                onRemove={(id) => dispatch({type: 'REMOVE_FROM_CART', payload: id})}
                            />
                        ))}
                    </div>

                    <aside className="cart-aside">
                        <OrderSummary subtotal={subtotal} total={total}/>
                        <TrustStrip/>
                    </aside>
                </div>
            )}

            <RecommendedRow/>
        </div>
    );
};

export default Cart;
