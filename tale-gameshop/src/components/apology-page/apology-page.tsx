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
                <div className="text-left text-sm text-gray-600 bg-white rounded-lg p-4 shadow-sm mb-6">
                    <h2 className="text-base font-semibold text-gray-800 mb-2">Privacy & analytics notice</h2>
                    <p>
                        Tale Shop uses analytics tools such as Google Analytics 4 and Yandex.Metrika to understand
                        browsing behavior and improve the storefront. Tracking is enabled only after you consent to
                        analytics cookies, and you can change your preferences at any time in the cookie banner.
                    </p>
                </div>
                <Link
                    to="/"
                    className="inline-flex btn btn-outline w-full sm:w-auto justify-center"
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
