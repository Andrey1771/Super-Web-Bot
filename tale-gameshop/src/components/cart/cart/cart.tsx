import React from 'react';
import {useCart} from '../../../context/cart-context';
import {Link} from "react-router-dom";
import container from "../../../inversify.config";
import {IUrlService} from "../../../iterfaces/i-url-service";
import IDENTIFIERS from "../../../constants/identifiers";

const Cart: React.FC = () => {
    const {state, dispatch} = useCart();

    const totalPrice = state.items.reduce((total, item) => total + item.price * item.quantity, 0);

    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    const buildImageSrc = (path: string) => path.startsWith('http') ? path : `${urlService.apiBaseUrl}/${path}`;

    const handleIncreaseQuantity = (id: string) => {
        dispatch({type: 'INCREASE_QUANTITY', payload: id});
    };

    const handleDecreaseQuantity = (id: string) => {
        dispatch({type: 'DECREASE_QUANTITY', payload: id});
    };

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
            <h2 className="text-2xl font-bold">Your Cart</h2>
            {state.items.length === 0 ? (
                <div className="text-center text-gray-600 py-6 space-y-3">
                    <p className="text-lg">Your cart is empty.</p>
                    <Link
                        to="/games"
                        className="inline-block px-5 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
                    >
                        Back to store
                    </Link>
                </div>
            ) : (
                <>
                    <div className="divide-y divide-gray-100">
                        {state.items.map((item) => (
                            <div key={item.gameId} className="flex items-center py-3 gap-4">
                                <img
                                    src={buildImageSrc(item.image)}
                                    alt={item.name}
                                    className="w-16 h-16 object-cover rounded-lg"
                                />
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-900">{item.name}</p>
                                    <p className="text-sm text-gray-500">${(item.price * item.quantity).toFixed(2)}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleDecreaseQuantity(item.gameId)}
                                        className="px-3 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                                    >
                                        -
                                    </button>
                                    <span className="font-semibold">{item.quantity}</span>
                                    <button
                                        onClick={() => handleIncreaseQuantity(item.gameId)}
                                        className="px-3 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                                    >
                                        +
                                    </button>
                                </div>
                                <button
                                    onClick={() => dispatch({type: 'REMOVE_FROM_CART', payload: item.gameId})}
                                    className="text-red-500 hover:underline"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 text-lg font-bold flex justify-between border-t pt-3">
                        <span>Total:</span>
                        <span>${totalPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => dispatch({type: 'CLEAR_CART'})}
                            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                        >
                            Clear Cart
                        </button>
                        <Link
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                            to="/checkout"
                        >
                            Proceed to Checkout
                        </Link>
                        <Link
                            className="px-4 py-2 border border-gray-300 text-gray-800 rounded-lg hover:bg-gray-50"
                            to="/games"
                        >
                            Continue shopping
                        </Link>
                    </div>
                </>
            )}
        </div>
    );
};

export default Cart;