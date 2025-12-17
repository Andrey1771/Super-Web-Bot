import React, {useMemo, useState} from 'react';
import {useCart} from '../../../context/cart-context';
import {Link} from "react-router-dom";
import container from "../../../inversify.config";
import {IUrlService} from "../../../iterfaces/i-url-service";
import IDENTIFIERS from "../../../constants/identifiers";
import {
    faArrowRotateLeft,
    faBolt,
    faCartPlus,
    faCircleCheck,
    faComments,
    faCreditCard,
    faShieldHalved,
    faTruckFast
} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {Product} from "../../../reducers/cart-reducer";

type CartItemRowProps = {
    item: Product;
    onIncrease: (id: string) => void;
    onDecrease: (id: string) => void;
    onRemove: (id: string) => void;
    imageBaseUrl: string;
};

type OrderSummaryProps = {
    subtotal: number;
    discount: number;
    total: number;
};

const formatPrice = (value: number) => `$${value.toFixed(2)}`;

const CartItemRow: React.FC<CartItemRowProps> = ({item, onIncrease, onDecrease, onRemove, imageBaseUrl}) => {
    const itemTotal = item.price * item.quantity;
    const listPrice = itemTotal * 1.12;

    return (
        <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start sm:gap-6">
            <div className="shrink-0">
                <img
                    src={`${imageBaseUrl}/${item.image}`}
                    alt={item.name}
                    className="h-28 w-28 rounded-2xl object-cover shadow-md shadow-purple-100"
                />
            </div>
            <div className="flex-1 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                        <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
                        <p className="text-sm text-gray-500">Platform - Steam · Region: Global · Edition: Standard</p>
                    </div>
                    <div className="space-y-1 text-right">
                        <p className="text-sm text-gray-400 line-through">{formatPrice(listPrice)}</p>
                        <p className="text-xl font-bold text-gray-900">{formatPrice(itemTotal)}</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 ring-1 ring-purple-100">
                        <FontAwesomeIcon icon={faBolt} className="text-purple-500"/>
                        Instant delivery
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 ring-1 ring-purple-100">
                        <FontAwesomeIcon icon={faCircleCheck} className="text-purple-500"/>
                        Verified key
                    </span>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4 text-sm font-medium text-purple-700">
                        <button
                            onClick={() => onRemove(item.gameId)}
                            className="hover:text-purple-900 hover:underline"
                        >
                            Remove
                        </button>
                        <button className="hover:text-purple-900 hover:underline">Save for later</button>
                    </div>
                    <div className="inline-flex items-center gap-3 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 shadow-inner shadow-purple-50">
                        <button
                            onClick={() => onDecrease(item.gameId)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-700 transition hover:bg-purple-50 hover:text-purple-700"
                        >
                            −
                        </button>
                        <span className="min-w-[2ch] text-center text-base">{item.quantity}</span>
                        <button
                            onClick={() => onIncrease(item.gameId)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-700 transition hover:bg-purple-50 hover:text-purple-700"
                        >
                            +
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const OrderSummary: React.FC<OrderSummaryProps> = ({subtotal, discount, total}) => (
    <div className="rounded-3xl border border-purple-100/70 bg-white/95 p-6 shadow-2xl shadow-purple-100/70 backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Order summary</h2>
            <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 ring-1 ring-purple-100">Secure checkout</span>
        </div>
        <div className="space-y-3 text-sm text-gray-700">
            <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span className="font-semibold text-gray-900">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
                <span>Discount</span>
                <span className="font-semibold text-purple-700">-{formatPrice(discount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-dashed border-purple-100 pt-4 text-base font-bold text-gray-900">
                <span>Total (USD)</span>
                <span className="text-2xl">{formatPrice(total)}</span>
            </div>
        </div>
        <div className="mt-6 space-y-3">
            <Link
                to="/checkout"
                className="inline-flex w-full items-center justify-center rounded-full bg-purple-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-200 transition hover:-translate-y-0.5 hover:bg-purple-700"
            >
                Checkout
            </Link>
            <Link
                to="/"
                className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-purple-700 ring-1 ring-purple-200 transition hover:bg-purple-50"
            >
                Continue shopping
            </Link>
        </div>
    </div>
);

const PromoCodeCard: React.FC = () => {
    const [code, setCode] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'applied'>('idle');

    const handleApply = () => {
        if (!code.trim()) return;
        setStatus('loading');
        setTimeout(() => {
            setStatus('applied');
        }, 900);
    };

    const buttonLabel = status === 'loading' ? 'Applying…' : status === 'applied' ? 'Applied' : 'Apply';
    const isDisabled = status === 'loading' || !code.trim();

    return (
        <div className="rounded-3xl border border-purple-100/70 bg-white/90 p-6 shadow-xl shadow-purple-100/60 backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Have a promo code?</h2>
                    <p className="text-sm text-gray-500">Enter your promo code or gift card. One code per order.</p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => {
                            setCode(e.target.value);
                            setStatus('idle');
                        }}
                        placeholder="Promo code"
                        className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 shadow-inner shadow-purple-50 focus:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-200 sm:w-56"
                    />
                    <button
                        onClick={handleApply}
                        disabled={isDisabled}
                        className={`inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-200 transition sm:w-auto ${isDisabled ? 'bg-purple-300 cursor-not-allowed' : 'bg-purple-600 hover:-translate-y-0.5 hover:bg-purple-700'}`}
                    >
                        {buttonLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

const RecommendedRow: React.FC = () => {
    const recommended = useMemo(() => ([
        {
            id: 'rec-1',
            title: 'Cyber Realm',
            price: 19.99,
            platform: 'Steam',
            image: 'https://images.unsplash.com/photo-1580128637428-81f51be9a1a6?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'rec-2',
            title: 'Mythic Odyssey',
            price: 24.99,
            platform: 'Steam',
            image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'rec-3',
            title: 'Neon Runner',
            price: 14.99,
            platform: 'Steam',
            image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'rec-4',
            title: 'Solar Frontier',
            price: 29.99,
            platform: 'Steam',
            image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80'
        }
    ]), []);

    return (
        <div className="rounded-3xl border border-purple-100/70 bg-white/90 p-6 shadow-xl shadow-purple-100/60 backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-gray-900">Recommended for you</h2>
                <button className="text-sm font-semibold text-purple-700 hover:text-purple-900">View all →</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {recommended.map((game) => (
                    <div key={game.id} className="group flex flex-col overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm shadow-purple-100 transition hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-100/80">
                        <div className="relative h-40 overflow-hidden bg-purple-50">
                            <img src={game.image} alt={game.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                        </div>
                        <div className="space-y-2 p-4">
                            <h3 className="text-base font-semibold text-gray-900">{game.title}</h3>
                            <p className="text-xs uppercase tracking-wide text-gray-500">{game.platform}</p>
                            <div className="flex items-center justify-between">
                                <span className="text-lg font-bold text-gray-900">{formatPrice(game.price)}</span>
                                <button className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 transition hover:border-purple-300 hover:bg-purple-100">
                                    <FontAwesomeIcon icon={faCartPlus} />
                                    Add to cart
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-6 flex items-center justify-center gap-2">
                {[0, 1, 2].map((dot) => (
                    <span
                        key={dot}
                        className={`h-2.5 w-2.5 rounded-full ${dot === 0 ? 'bg-purple-600 shadow-[0_0_0_6px] shadow-purple-100' : 'bg-purple-200'}`}
                    ></span>
                ))}
            </div>
        </div>
    );
};

const SupportPolicies: React.FC = () => (
    <div className="rounded-3xl border border-purple-100/70 bg-white/90 p-6 shadow-xl shadow-purple-100/60 backdrop-blur">
        <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-gray-900">Support & policies</h2>
            <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 ring-1 ring-purple-100">We have your back</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-2xl border border-purple-100 bg-white p-4 shadow-sm shadow-purple-100">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-600 ring-1 ring-purple-100">
                        <FontAwesomeIcon icon={faBolt} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900">Instant delivery</h3>
                        <p className="text-sm text-gray-600">Get your key via email within minutes.</p>
                    </div>
                </div>
            </div>
            <div className="flex flex-col gap-3 rounded-2xl border border-purple-100 bg-white p-4 shadow-sm shadow-purple-100">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-600 ring-1 ring-purple-100">
                        <FontAwesomeIcon icon={faArrowRotateLeft} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900">Refund policy</h3>
                        <p className="text-sm text-gray-600">Full refunds available within 14 days.</p>
                    </div>
                </div>
            </div>
            <div className="flex flex-col gap-3 rounded-2xl border border-purple-100 bg-white p-4 shadow-sm shadow-purple-100">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-600 ring-1 ring-purple-100">
                        <FontAwesomeIcon icon={faCreditCard} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900">Secure payments</h3>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-purple-700">
                            {['Visa', 'Mastercard', 'PayPal', 'Apple Pay'].map((label) => (
                                <span key={label} className="rounded-full bg-purple-50 px-3 py-1 ring-1 ring-purple-100">{label}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex flex-col gap-4 rounded-2xl border border-purple-100 bg-white p-4 shadow-sm shadow-purple-100">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-600 ring-1 ring-purple-100">
                        <FontAwesomeIcon icon={faComments} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900">Need help?</h3>
                        <p className="text-sm text-gray-600">Our team is here 24/7 to support you.</p>
                    </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <Link
                        to="/support"
                        className="inline-flex items-center justify-center rounded-full bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-purple-200 transition hover:-translate-y-0.5 hover:bg-purple-700"
                    >
                        Contact support
                    </Link>
                    <Link
                        to="/"
                        className="inline-flex items-center justify-center rounded-full border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm font-semibold text-purple-700 transition hover:bg-purple-100"
                    >
                        Continue shopping
                    </Link>
                </div>
            </div>
        </div>
    </div>
);

const CartCTA: React.FC = () => (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-purple-900 via-purple-800 to-gray-900 p-8 shadow-2xl shadow-purple-300/30">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl space-y-3 text-white">
                <h2 className="text-3xl font-bold">Ready to checkout?</h2>
                <p className="text-lg text-purple-100">Secure payments and instant delivery in minutes.</p>
                <div className="flex flex-wrap gap-3 text-sm text-purple-100">
                    {["Secure payments", "Instant email delivery", "Refund policy"].map((benefit) => (
                        <span key={benefit} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                            <FontAwesomeIcon icon={faCircleCheck} className="text-purple-200" />
                            {benefit}
                        </span>
                    ))}
                </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                    to="/checkout"
                    className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-purple-800 shadow-lg shadow-purple-400/30 transition hover:-translate-y-0.5"
                >
                    Checkout
                </Link>
                <Link
                    to="/"
                    className="inline-flex items-center justify-center rounded-full border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                    Continue shopping
                </Link>
            </div>
        </div>
    </div>
);

const Cart: React.FC = () => {
    const {state, dispatch} = useCart();

    const subtotal = state.items.reduce((total, item) => total + item.price * item.quantity, 0);
    const discount = subtotal * 0.08;
    const total = Math.max(0, subtotal - discount);

    const itemCount = state.items.length;

    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    const handleIncreaseQuantity = (id: string) => {
        dispatch({type: 'INCREASE_QUANTITY', payload: id});
    };

    const handleDecreaseQuantity = (id: string) => {
        dispatch({type: 'DECREASE_QUANTITY', payload: id});
    };

    return (
        <div className="relative isolate">
            <div className="flex flex-col gap-6 lg:gap-8">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-1">
                        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-purple-700">Cart</p>
                        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Your cart</h1>
                        <p className="text-gray-600">Digital keys delivered instantly</p>
                    </div>
                    <div className="inline-flex w-fit items-center gap-2 rounded-full bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-800 shadow-sm ring-1 ring-purple-100">
                        <span className="h-2 w-2 rounded-full bg-purple-500"></span>
                        {itemCount} {itemCount === 1 ? 'item' : 'items'}
                    </div>
                </div>

                <PromoCodeCard />

                {state.items.length === 0 ? (
                    <div className="rounded-3xl border border-purple-100/70 bg-white/80 p-10 text-center shadow-lg shadow-purple-100">
                        <h3 className="text-xl font-semibold text-gray-900">Your cart is empty</h3>
                        <p className="mt-2 text-gray-600">Add some games to unlock instant delivery and exclusive deals.</p>
                        <Link
                            to="/"
                            className="mt-6 inline-flex items-center justify-center rounded-full bg-purple-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-200 transition hover:translate-y-0.5 hover:bg-purple-700"
                        >
                            Continue shopping
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_0.8fr] lg:gap-10">
                        <div className="rounded-3xl border border-purple-100/70 bg-white/90 p-6 shadow-xl shadow-purple-100/60 backdrop-blur">
                            <div className="divide-y divide-gray-100/80">
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
                        </div>

                        <div className="lg:sticky lg:top-6 space-y-4">
                            <OrderSummary subtotal={subtotal} discount={discount} total={total} />
                            <div className="grid gap-3 rounded-2xl border border-purple-100/70 bg-white/80 p-4 text-sm text-gray-700 shadow-lg shadow-purple-100/60">
                                {[{label: 'Secure payments', icon: faShieldHalved}, {label: 'Instant email delivery', icon: faBolt}, {label: 'Refund policy', icon: faTruckFast}].map((feature) => (
                                    <div key={feature.label} className="flex items-center gap-3 rounded-xl bg-purple-50/50 px-3 py-2 text-gray-800 ring-1 ring-purple-100">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-purple-600 shadow-inner shadow-purple-100 ring-1 ring-purple-100">
                                            <FontAwesomeIcon icon={feature.icon} />
                                        </div>
                                        <span className="font-semibold">{feature.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <RecommendedRow />
                <SupportPolicies />
                <CartCTA />
            </div>
        </div>
    );
};

export default Cart;
