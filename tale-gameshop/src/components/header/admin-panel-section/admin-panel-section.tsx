import React from "react";
import {Link} from "react-router-dom";
import {faGear} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";

interface AdminPanelSectionProps {
    className?: string;
    onClick?: () => void;
}

const AdminPanelSection: React.FC<AdminPanelSectionProps> = ({className = "menu-item admin-link", onClick}) => {
    return (
        <Link className={className} to="/admin" onClick={onClick}>
            <FontAwesomeIcon icon={faGear}/>
            Admin
        </Link>
    );
};

export default AdminPanelSection;
