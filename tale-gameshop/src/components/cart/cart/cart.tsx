// src/components/Cart.tsx
import React from 'react';
import { useCart } from '../../../context/cart-context';

const Cart: React.FC = () => {
    const { state, dispatch } = useCart();

    const handleRemoveFromCart = (id: number) => {
        dispatch({ type: 'REMOVE_FROM_CART', payload: id });
    };

    return (
        <div className="p-4 border-t mt-4">
            <h2 className="text-xl font-bold">Your Cart</h2>
            {state.items.length === 0 ? (
                <p className="text-gray-600">Cart is empty.</p>
            ) : (
                state.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center p-2 border-b">
                        <span>{item.name}</span>
                        <span>{item.quantity} x ${item.price.toFixed(2)}</span>
                        <button
                            onClick={() => handleRemoveFromCart(item.id)}
                            className="text-red-500 hover:underline"
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
