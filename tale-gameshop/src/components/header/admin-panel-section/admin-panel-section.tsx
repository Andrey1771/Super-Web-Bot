import React from "react";
import {Link} from "react-router-dom";

const AdminPanelSection: React.FC = () => {
    return (
        <Link className="btn btn-outline" to="/admin">
            Admin Panel
        </Link>
    );
};

export default AdminPanelSection;
