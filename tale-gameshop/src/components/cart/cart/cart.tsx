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
    const placeholder = '/images/game-placeholder.svg';

    const resolveImage = (imagePath?: string) => {
        if (!imagePath) {
            return placeholder;
        }
        if (imagePath.startsWith('http')) {
            return imagePath;
        }
        if (imagePath.startsWith('/')) {
            return imagePath;
        }
        return `${urlService.apiBaseUrl}/${imagePath}`;
    };

    const handleIncreaseQuantity = (id: string) => {
        dispatch({type: 'INCREASE_QUANTITY', payload: id});
    };

    const handleDecreaseQuantity = (id: string) => {
        dispatch({type: 'DECREASE_QUANTITY', payload: id});
    };

    return (
        <div className="p-4 border-t mt-4 bg-white rounded-lg shadow-sm">
            <h2 className="text-xl font-bold mb-4">Your Cart</h2>
            {state.items.length === 0 ? (
                <div className="text-gray-600 flex flex-col gap-4 items-start">
                    <p>Cart is empty.</p>
                    <Link className="px-4 py-2 bg-black text-white rounded hover:text-purple-500" to="/games">
                        Back to store
                    </Link>
                </div>
            ) : (
                <>
                    {state.items.map((item) => (
                        <div key={item.gameId} className="flex items-center p-2 border-b gap-4">
                            <img
                                src={resolveImage(item.image)}
                                alt={item.name}
                                className="w-16 h-16 object-cover rounded"
                                onError={(event) => {
                                    const target = event.target as HTMLImageElement;
                                    if (target.src !== placeholder) {
                                        target.src = placeholder;
                                    }
                                }}
                            />
                            <div className="flex-1">
                                <span className="font-bold">{item.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleDecreaseQuantity(item.gameId)}
                                    className="px-2 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                                >
                                    -
                                </button>
                                <span>{item.quantity}</span>
                                <button
                                    onClick={() => handleIncreaseQuantity(item.gameId)}
                                    className="px-2 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                                >
                                    +
                                </button>
                            </div>
                            <span className="flex-1 text-right">${(item.price * item.quantity).toFixed(2)}</span>
                            <button
                                onClick={() => dispatch({type: 'REMOVE_FROM_CART', payload: item.gameId})}
                                className="ml-4 text-red-500 hover:underline"
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                    <div className="mt-4 text-lg font-bold flex justify-between border-t pt-2">
                        <span>Total:</span>
                        <span>${totalPrice.toFixed(2)}</span>
                    </div>
                    <div className="mt-4 flex gap-4 flex-wrap">
                        <button
                            onClick={() => dispatch({type: 'CLEAR_CART'})}
                            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-700"
                        >
                            Clear Cart
                        </button>
                        <Link
                            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-700"
                            to="/checkout"
                        >
                            Proceed to Checkout
                        </Link>
                    </div>
                </>
            )}
        </div>
    );
};

export default Cart;
