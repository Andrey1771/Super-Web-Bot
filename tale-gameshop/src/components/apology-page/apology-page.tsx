import React from 'react';
import {Link} from "react-router-dom";

import taleShopUnderConstruction from "../../assets/images/tale-shop-under-construction.png"

const ApologyPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6">
            <div className="max-w-md w-full text-center">
                <h1 className="text-4xl font-bold text-gray-800 mb-4">We’re Sorry!</h1>
                <p className="text-gray-600 mb-6">
                    This page is currently under development. We’re working hard to bring it to you as soon as possible.
                </p>
                <p className="text-gray-600 mb-6">
                    Please check back soon, or feel free to explore other sections of our website.
                </p>
                <Link
                    to="/"
                    className="inline-block px-4 py-2 border rounded-lg border-gray-700 text-gray-700 animated-button cursor-pointer"
                >
                    Go Back to Home
                </Link>
                <div className="mt-6">
                    <img
                        src={taleShopUnderConstruction}
                        alt="Under Construction"
                        className="w-48 mx-auto"
                    />
                </div>
            </div>
        </div>
    );
};

export default ApologyPage;