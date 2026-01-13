import React, {useEffect, useRef, useState} from "react";
import {Link} from "react-router-dom";
import "./tale-gameshop-header.css";
import GameCategoryDropDown from "../../game-category-drop-down/game-category-drop-down";
import {useKeycloak} from "@react-keycloak/web";
import {faBars, faChevronDown, faCircleUser, faTimes} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";

import logo from '../../../assets/images/tale-shop-logo.jpeg';
import LoginAndRegisterSection from "../login-and-register-section/login-and-register-section";
import AdminPanelSection from "../admin-panel-section/admin-panel-section";
import container from "../../../inversify.config";
import type {IKeycloakAuthService} from "../../../iterfaces/i-keycloak-auth-service";
import IDENTIFIERS from "../../../constants/identifiers";

export default function TaleGameshopHeader() {
    const {keycloak} = useKeycloak();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAccountOpen, setIsAccountOpen] = useState(false);
    const [isDrawerAccountOpen, setIsDrawerAccountOpen] = useState(false);
    const accountMenuRef = useRef<HTMLDivElement | null>(null);
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);

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

    useEffect(() => {
        if (!isAccountOpen) {
            return;
        }

        const handleClickOutside = (event: MouseEvent) => {
            if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
                setIsAccountOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsAccountOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isAccountOpen]);

    useEffect(() => {
        if (!isMenuOpen) {
            setIsDrawerAccountOpen(false);
        }
    }, [isMenuOpen]);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth > 1180) {
                setIsMenuOpen(false);
                setIsDrawerAccountOpen(false);
            }
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const isAdmin = keycloak.tokenParsed?.resource_access?.["tale-shop-app"]?.["roles"].some(
        (role) => role === "admin"
    );
    const email = keycloak.tokenParsed?.email ?? keycloak.tokenParsed?.preferred_username ?? "User";

    const handleLogout = async () => {
        await keycloakAuthService.logoutWithRedirect(keycloak, window.location.href);
    };

    const navLinks = [
        {label: "Home", to: "/"},
        {label: "Store", to: "/games"},
        {label: "Blog", to: "/blog"},
        {label: "About", to: "/about"},
        {label: "Support", to: "/support"}
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
                            {isAdmin && (
                                <AdminPanelSection></AdminPanelSection>
                            )}
                            <div className="account-menu" ref={accountMenuRef}>
                                <button
                                    className="account-trigger"
                                    type="button"
                                    onClick={() => setIsAccountOpen((prev) => !prev)}
                                    aria-expanded={isAccountOpen}
                                    aria-haspopup="true"
                                >
                                    <FontAwesomeIcon icon={faCircleUser}/>
                                    <span>My account</span>
                                    <FontAwesomeIcon className="caret" icon={faChevronDown}/>
                                </button>
                                <div className={`account-dropdown ${isAccountOpen ? 'open' : ''}`}>
                                    <div className="account-signed-in">
                                        Signed in as <span>{email}</span>
                                    </div>
                                    <div className="account-links">
                                        <Link to="/account" className="account-link" onClick={() => setIsAccountOpen(false)}>
                                            Profile
                                        </Link>
                                        <Link to="/account/orders" className="account-link" onClick={() => setIsAccountOpen(false)}>
                                            Orders
                                        </Link>
                                        <Link to="/account/keys" className="account-link" onClick={() => setIsAccountOpen(false)}>
                                            Keys
                                        </Link>
                                        <Link to="/account/settings" className="account-link" onClick={() => setIsAccountOpen(false)}>
                                            Settings
                                        </Link>
                                    </div>
                                    <button className="account-link sign-out" type="button" onClick={handleLogout}>
                                        Sign out
                                    </button>
                                </div>
                            </div>
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
                    <ul className="drawer-links">
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
                    {isAdmin && (
                        <>
                            <li className="drawer-divider" aria-hidden="true"></li>
                            <li>
                                <AdminPanelSection onClick={() => setIsMenuOpen(false)} className="menu-item drawer-admin"></AdminPanelSection>
                            </li>
                        </>
                    )}
                    </ul>
                    <div className="drawer-actions">
                        {!keycloak.authenticated ? (
                            <LoginAndRegisterSection stacked></LoginAndRegisterSection>
                        ) : (
                            <div className="drawer-account">
                                <button
                                    className={`drawer-account-trigger ${isDrawerAccountOpen ? 'open' : ''}`}
                                    type="button"
                                    onClick={() => setIsDrawerAccountOpen((prev) => !prev)}
                                    aria-expanded={isDrawerAccountOpen}
                                >
                                    <span className="drawer-account-title">
                                        <FontAwesomeIcon icon={faCircleUser}/>
                                        My account
                                    </span>
                                    <FontAwesomeIcon className="drawer-account-caret" icon={faChevronDown}/>
                                </button>
                                <div className="drawer-account-email">Signed in as {email}</div>
                                <div className={`drawer-account-links ${isDrawerAccountOpen ? 'open' : ''}`}>
                                    <Link to="/account" className="menu-item" onClick={() => setIsMenuOpen(false)}>
                                        Profile
                                    </Link>
                                    <Link to="/account/orders" className="menu-item" onClick={() => setIsMenuOpen(false)}>
                                        Orders
                                    </Link>
                                    <Link to="/account/keys" className="menu-item" onClick={() => setIsMenuOpen(false)}>
                                        Keys
                                    </Link>
                                    <Link to="/account/settings" className="menu-item" onClick={() => setIsMenuOpen(false)}>
                                        Settings
                                    </Link>
                                    <button className="drawer-sign-out" type="button" onClick={handleLogout}>
                                        Sign out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}
