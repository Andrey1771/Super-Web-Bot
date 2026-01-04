import React, {useState, useEffect} from "react";
import {Link} from "react-router-dom";
import "./tale-gameshop-header.css";
import LogOutButton from "../../logout-button/logout-button";
import GameCategoryDropDown from "../../game-category-drop-down/game-category-drop-down";
import {useKeycloak} from "@react-keycloak/web";
import {faBars, faTimes} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";

import logo from '../../../assets/images/tale-shop-logo.jpeg';
import LoginAndRegisterSection from "../login-and-register-section/login-and-register-section";
import AdminPanelSection from "../admin-panel-section/admin-panel-section";

export default function TaleGameshopHeader() {
    const {keycloak} = useKeycloak();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            const header = document.querySelector(".header-nav");
            if (window.scrollY > 0) {
                header?.classList.add("scrolled");
            } else {
                header?.classList.remove("scrolled");
            }
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const isAdmin = keycloak.tokenParsed?.resource_access?.["tale-shop-app"]?.["roles"].some(
        (role) => role === "admin"
    );
    const email = keycloak.tokenParsed?.email;

    const navLinks = [
        {label: "Home", to: "/"},
        {label: "Store", to: "/games"},
        {label: "Blog", to: "/blog"},
        {label: "About", to: "/about"},
        {label: "Support", to: "/apologyPage"}
    ];

    return (
        <nav className="header-nav">
            <div className="container header-bar">
                <div className="brand">
                    <img src={logo} alt="Tale Shop logo"/>
                    <span className="menu-item">Tale Shop</span>
                </div>

                <ul className="nav-links">
                    {navLinks.map((link) => (
                        <li key={link.label}>
                            <Link className="menu-item" to={link.to}>
                                {link.label}
                            </Link>
                        </li>
                    ))}
                    <li className="relative dropdown">
                        <Link to={`/games`} className="menu-item more-link">
                            More
                            <svg aria-hidden="true" viewBox="0 0 24 24">
                                <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                        </Link>
                        <GameCategoryDropDown categories={[]}/>
                    </li>
                </ul>

                <div className="header-actions">
                    {!keycloak.authenticated ? (
                        <LoginAndRegisterSection></LoginAndRegisterSection>
                    ) : (
                        <>
                            <span className="email">{email}</span>
                            {isAdmin && (
                                <AdminPanelSection></AdminPanelSection>
                            )}
                            <LogOutButton/>
                        </>
                    )}
                </div>

                <button
                    className="menu-toggle"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    aria-label="Toggle menu"
                >
                    <FontAwesomeIcon icon={isMenuOpen ? faTimes : faBars}/>
                </button>

                <div className={`nav-drawer ${isMenuOpen ? 'open' : ''}`}>
                    <ul>
                        {navLinks.map((link) => (
                            <li key={link.label}>
                                <Link className="menu-item" to={link.to} onClick={() => setIsMenuOpen(false)}>
                                    {link.label}
                                </Link>
                        </li>
                    ))}
                    <li>
                        <Link to={`/games`} className="menu-item" onClick={() => setIsMenuOpen(false)}>
                            More Games
                        </Link>
                        <GameCategoryDropDown categories={[]}/>
                    </li>
                    </ul>
                    <div className="drawer-actions">
                        {!keycloak.authenticated ? (
                            <LoginAndRegisterSection stacked></LoginAndRegisterSection>
                        ) : (
                            <div className="auth-buttons stacked">
                                {isAdmin && (
                                    <AdminPanelSection></AdminPanelSection>
                                )}
                                <LogOutButton/>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}
