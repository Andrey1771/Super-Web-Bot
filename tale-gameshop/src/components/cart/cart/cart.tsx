import React from 'react';
import {useCart} from "../../../context/cart-context";

const Cart: React.FC = () => {
    const { state, dispatch } = useCart();

    const handleIncreaseQuantity = (id: number) => {
        dispatch({ type: 'INCREASE_QUANTITY', payload: id });
    };

    const handleDecreaseQuantity = (id: number) => {
        dispatch({ type: 'DECREASE_QUANTITY', payload: id });
    };

    return (
        <div className="p-4 border-t mt-4">
            <h2 className="text-xl font-bold">Your Cart</h2>
            {state.items.length === 0 ? (
                <p className="text-gray-600">Cart is empty.</p>
            ) : (
                state.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center p-2 border-b">
                        <span className="flex-1">{item.name}</span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleDecreaseQuantity(item.id)}
                                className="px-2 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                            >
                                -
                            </button>
                            <span>{item.quantity}</span>
                            <button
                                onClick={() => handleIncreaseQuantity(item.id)}
                                className="px-2 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                            >
                                +
                            </button>
                        </div>
                        <span className="flex-1 text-right">${(item.price * item.quantity).toFixed(2)}</span>
                        <button
                            onClick={() => dispatch({ type: 'REMOVE_FROM_CART', payload: item.id })}
                            className="ml-4 text-red-500 hover:underline"
                        >
                            Remove
                        </button>
                    </div>
                ))
            )}
            {state.items.length > 0 && (
                <div className="mt-4">
                    <button
                        onClick={() => dispatch({ type: 'CLEAR_CART' })}
                        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-700"
                    >
                        Clear Cart
                    </button>
                </div>
            )}
        </div>
    );
};

export default Cart;