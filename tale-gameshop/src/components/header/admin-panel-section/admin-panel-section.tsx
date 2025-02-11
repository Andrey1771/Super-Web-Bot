import React from "react";
import {Link} from "react-router-dom";

const AdminPanelSection: React.FC = ({}) => {
    return <>
        <Link className="hidden lg:flex px-4 py-2 bg-red-500 text-white" to="/admin">
            Open Admin Panel
        </Link>
        <Link className="lg:hidden text-gray-700 menu-item cursor-pointer" to="/admin">
            Open Admin Panel
        </Link>
    </>
}

export default AdminPanelSection;