import React from 'react';
import {useCart} from '../../../context/cart-context';
import {Link} from "react-router-dom";
import container from "../../../inversify.config";
import {IUrlService} from "../../../iterfaces/i-url-service";
import IDENTIFIERS from "../../../constants/identifiers";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faBolt, faCircleCheck, faShieldHalved, faTruckFast} from "@fortawesome/free-solid-svg-icons";

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

    const formatPrice = (value: number) => `$${value.toFixed(2)}`;

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
                    <div className="grid grid-cols-1 gap-6 lg:gap-10 lg:grid-cols-[1.4fr_0.8fr]">
                        <div className="rounded-3xl border border-purple-100/70 bg-white/90 p-6 shadow-xl shadow-purple-100/60 backdrop-blur">
                            <div className="divide-y divide-gray-100/80">
                                {state.items.map((item) => {
                                    const itemTotal = item.price * item.quantity;
                                    const listPrice = itemTotal * 1.12;
                                    return (
                                        <div key={item.gameId} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start sm:gap-6">
                                            <div className="shrink-0">
                                                <img
                                                    src={`${urlService.apiBaseUrl}/${item.image}`}
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
                                                    <div className="text-right space-y-1">
                                                        <p className="text-sm text-gray-400 line-through">{formatPrice(listPrice)}</p>
                                                        <p className="text-xl font-bold text-gray-900">{formatPrice(itemTotal)}</p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 ring-1 ring-purple-100">
                                                        <FontAwesomeIcon icon={faBolt} className="text-purple-500" />
                                                        Instant delivery
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 ring-1 ring-purple-100">
                                                        <FontAwesomeIcon icon={faCircleCheck} className="text-purple-500" />
                                                        Verified key
                                                    </span>
                                                </div>
                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="flex items-center gap-4 text-sm font-medium text-purple-700">
                                                        <button
                                                            onClick={() => dispatch({type: 'REMOVE_FROM_CART', payload: item.gameId})}
                                                            className="hover:text-purple-900 hover:underline"
                                                        >
                                                            Remove
                                                        </button>
                                                        <button className="hover:text-purple-900 hover:underline">Save for later</button>
                                                    </div>
                                                    <div className="inline-flex items-center gap-3 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 shadow-inner shadow-purple-50">
                                                        <button
                                                            onClick={() => handleDecreaseQuantity(item.gameId)}
                                                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-700 transition hover:bg-purple-50 hover:text-purple-700"
                                                        >
                                                            −
                                                        </button>
                                                        <span className="min-w-[2ch] text-center text-base">{item.quantity}</span>
                                                        <button
                                                            onClick={() => handleIncreaseQuantity(item.gameId)}
                                                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-700 transition hover:bg-purple-50 hover:text-purple-700"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="lg:sticky lg:top-6">
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
                            <div className="mt-4 grid gap-3 rounded-2xl border border-purple-100/70 bg-white/80 p-4 text-sm text-gray-700 shadow-lg shadow-purple-100/60">
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
            </div>
        </div>
    );
};

export default Cart;
