import React from "react";
import {Link} from "react-router-dom";
import {useTranslation} from "react-i18next";
import {faGear} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";

interface AdminPanelSectionProps {
    className?: string;
    onClick?: () => void;
}

const AdminPanelSection: React.FC<AdminPanelSectionProps> = ({className = "menu-item admin-link", onClick}) => {
    const {t} = useTranslation();
    return (
        <Link className={className} to="/admin" onClick={onClick}>
            <FontAwesomeIcon icon={faGear}/>
            {t("common.admin")}
        </Link>
    );
};

export default AdminPanelSection;
