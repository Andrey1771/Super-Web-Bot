import React, {useEffect, useState} from "react";
import {Link, NavLink} from "react-router-dom";
import "./tale-gameshop-header.css";
import LogOutButton from "../../logout-button/logout-button";
import {useKeycloak} from "@react-keycloak/web";
import {faBars, faTimes} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import CartIcon from "../../cart/cart-icon/cart-icon";
import LoginAndRegisterSection from "../login-and-register-section/login-and-register-section";
import AdminPanelSection from "../admin-panel-section/admin-panel-section";

const TaleGameshopHeader: React.FC = () => {
    const {keycloak} = useKeycloak();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        const closeOnResize = () => {
            if (window.innerWidth > 900) {
                setIsMenuOpen(false);
            }
        };

        window.addEventListener("resize", closeOnResize);
        return () => window.removeEventListener("resize", closeOnResize);
    }, []);

    const isAdmin = keycloak.tokenParsed?.resource_access?.["tale-shop-app"]?.["roles"].some(
        (role) => role === "admin"
    );

    const navLinks = [
        {to: "/games", label: "Game Store"},
        {to: "/about", label: "About Us"},
        {to: "/contact", label: "Contact Us"},
        {to: "/help", label: "Help Centre"},
        {to: "/faqs", label: "FAQs"},
    ];

    return (
        <header className="header">
            <div className="container header-inner">
                <Link to="/" className="brand">Tale Shop</Link>

                <button className="menu-toggle" onClick={() => setIsMenuOpen(!isMenuOpen)} aria-label="Toggle menu">
                    <FontAwesomeIcon icon={isMenuOpen ? faTimes : faBars}/>
                </button>

                <ul className={`nav-links ${isMenuOpen ? "open" : ""}`}>
                    {navLinks.map((link) => (
                        <li key={link.to}>
                            <NavLink
                                to={link.to}
                                className={({isActive}) => `nav-link ${isActive ? "active" : ""}`}
                                onClick={() => setIsMenuOpen(false)}
                            >
                                {link.label}
                            </NavLink>
                        </li>
                    ))}
                    {isAdmin && (
                        <li className="mobile-only">
                            <AdminPanelSection/>
                        </li>
                    )}
                </ul>

                <div className="header-actions">
                    <CartIcon isText={false}/>
                    {!keycloak.authenticated ? (
                        <LoginAndRegisterSection/>
                    ) : (
                        <>
                            <span className="badge">Account</span>
                            {isAdmin && <AdminPanelSection/>}
                            <LogOutButton/>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
};

export default TaleGameshopHeader;
