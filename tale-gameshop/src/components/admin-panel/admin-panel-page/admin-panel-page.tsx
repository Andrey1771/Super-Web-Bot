import React from 'react';
import {Link} from "react-router-dom";

const AdminPanelPage: React.FC = () => {

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-gray-100">
            <Link
                className="w-full mt-6 py-3 px-6 bg-green-500 text-white font-semibold rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400"
                to="/admin/botChanger">Open bot changer</Link>
            <Link
                className="w-full mt-6 py-3 px-6 bg-green-500 text-white font-semibold rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400"
                to="/admin/siteChanger">Open image changer</Link>
            <Link
                className="w-full mt-6 py-3 px-6 bg-green-500 text-white font-semibold rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400"
                to="/admin/cardAdder">Open card adder</Link>
        </div>

    );
};

export default AdminPanelPage;