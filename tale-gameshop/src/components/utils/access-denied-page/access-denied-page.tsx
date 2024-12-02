import { Link } from "react-router-dom";
import React from "react";

const AccessDeniedPage: React.FC = () => {
    return (
        <div className="bg-gray-100 flex items-center justify-center min-h-screen">
            <div className="text-center p-8 bg-white shadow-lg rounded-lg">
                <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-white text-3xl font-bold">!</span>
                </div>
                <h1 className="text-3xl font-bold text-gray-800 mb-2">Access Denied</h1>
                <p className="text-gray-600 mb-6">You do not have permission to view this page.</p>
                <Link className="px-6 py-3 text-white bg-blue-500 rounded hover:bg-blue-600 transition"
                      to="/">Go Back Home</Link>
            </div>
        </div>
    );
};

export default AccessDeniedPage;