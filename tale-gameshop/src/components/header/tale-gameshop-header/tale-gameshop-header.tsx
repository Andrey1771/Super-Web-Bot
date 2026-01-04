import React, {useState, useEffect} from "react";
import {Link} from "react-router-dom";
import "./tale-gameshop-header.css";
import LogOutButton from "../../logout-button/logout-button";
import GameCategoryDropDown from "../../game-category-drop-down/game-category-drop-down";
import {useKeycloak} from "@react-keycloak/web";
import {faBars, faTimes} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";

import TaleGameshopLogo from "../tale-gameshop-logo/tale-gameshop-logo";
import CartIcon from "../../cart/cart-icon/cart-icon";
import LoginAndRegisterSection from "../login-and-register-section/login-and-register-section";
import AdminPanelSection from "../admin-panel-section/admin-panel-section";

export default function TaleGameshopHeader() {
    const {keycloak} = useKeycloak();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isTop, setIsTop] = useState(true);

    useEffect(() => {
        const handleScroll = () => {
            setIsTop(window.scrollY === 0);
        };

        handleScroll();
        window.addEventListener("scroll", handleScroll, {passive: true});
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
        <nav className={`header-nav ${isTop ? "header--top" : "scrolled"}`}>
            <div className="container header-bar">
                <div className="brand">
                    <TaleGameshopLogo className="brand-logo" role="img" aria-label="Tale Shop logo"/>
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
                        <Link to={`/games`} className="menu-item">
                            More
                        </Link>
                        <GameCategoryDropDown categories={[]}/>
                    </li>
                </ul>

                <div className="header-actions">
                    <CartIcon isText={false}></CartIcon>
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
                        <CartIcon isText={true}></CartIcon>
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
