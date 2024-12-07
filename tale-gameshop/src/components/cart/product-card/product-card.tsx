// src/components/ProductCard.tsx
import React from 'react';
import { useCart } from '../../../context/cart-context';

interface ProductProps {
    id: number;
    name: string;
    price: number;
}

const ProductCard: React.FC<ProductProps> = ({ id, name, price }) => {
    const { dispatch } = useCart();

    const handleAddToCart = () => {
        dispatch({
            type: 'ADD_TO_CART',
            payload: { id, name, price, quantity: 1 },
        });
    };

    return (
        <div className="border p-4 rounded shadow-md">
            <h2 className="text-lg font-bold">{name}</h2>
            <p className="text-gray-600">${price.toFixed(2)}</p>
            <button
                onClick={handleAddToCart}
                className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-700"
            >
                Add to Cart
            </button>
        </div>
    );
};

export default ProductCard;
