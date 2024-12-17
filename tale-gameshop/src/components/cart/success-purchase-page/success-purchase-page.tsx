import React from 'react';
import {Link, useSearchParams} from 'react-router-dom';

const SuccessPurchasePage: React.FC = () => {
    const [searchParams] = useSearchParams();

    const orderId = searchParams.get('orderId') || 'N/A';
    const totalAmount = parseFloat(searchParams.get('totalAmount') || '0');

    const handleContinueShopping = () => {
        // Replace with actual navigation logic if needed
        console.log('Continue shopping clicked');
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
                <svg
                    className="w-16 h-16 text-green-500 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path>
                </svg>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Purchase Successful!</h2>
                <p className="text-gray-600 mb-4">Thank you for your order. Order number:</p>
                <p className="text-lg font-semibold text-gray-700 mb-6">#{orderId}</p>
                <p className="text-gray-600 mb-6">
                    Total Amount: <span className="font-medium text-gray-800">{totalAmount.toFixed(2)} ₽</span>
                </p>
                <Link to="/games"
                    className="px-6 py-3 bg-green-500 text-white rounded-lg shadow hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-50"
                >
                    Continue Shopping
                </Link>
            </div>
        </div>
    );
};

export default SuccessPurchasePage;