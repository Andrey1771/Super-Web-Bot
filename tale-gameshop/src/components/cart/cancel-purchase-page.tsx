import React from 'react';
import { Link } from 'react-router-dom';

const CancelPurchasePage: React.FC = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Payment canceled</h2>
                <p className="text-gray-600 mb-6">Your payment was canceled. You can return to checkout and try again.</p>
                <Link to="/checkout" className="px-6 py-3 bg-violet-600 text-white rounded-lg shadow hover:bg-violet-700">
                    Back to checkout
                </Link>
            </div>
        </div>
    );
};

export default CancelPurchasePage;
