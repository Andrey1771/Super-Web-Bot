import React, {useState, useEffect} from "react";
import {Link} from "react-router-dom";
import "./tale-gameshop-header.css";
import LogOutButton from "../../logout-button/logout-button";
import GameCategoryDropDown from "../../game-category-drop-down/game-category-drop-down";
import {useKeycloak} from "@react-keycloak/web";
import {faBars, faTimes} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";

import logo from '../../../assets/images/tale-shop-logo.jpeg';
import CartIcon from "../../cart/cart-icon/cart-icon";
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

    const accountLabel = keycloak.authenticated ? "Profile" : "";

    const closeMenu = () => setIsMenuOpen(false);

    return (
        <nav className="bg-white border-b border-gray-200 header-nav">
            <div className="max-w-6xl mx-auto px-4 lg:px-6 flex items-center justify-between h-20">
                <Link to="/" className="flex items-center space-x-3 min-w-0" onClick={closeMenu}>
                    <img className="w-12 h-12 rounded-lg border" src={logo} alt="Logo"/>
                    <span className="text-xl font-bold text-gray-900 truncate">Tale Shop</span>
                </Link>

                <button
                    className="lg:hidden text-gray-700 text-2xl w-12 h-12 flex items-center justify-center"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    aria-label="Toggle navigation"
                >
                    <FontAwesomeIcon icon={isMenuOpen ? faTimes : faBars}/>
                </button>

                <div
                    className={`nav-links ${isMenuOpen ? 'flex' : 'hidden'} lg:flex flex-col lg:flex-row items-center lg:items-center lg:justify-between w-full lg:w-auto`}
                >
                    <ul className="flex flex-col lg:flex-row items-center gap-4 lg:gap-6 text-center lg:text-left px-2 lg:px-0">
                        <li>
                            <Link className="text-gray-700 menu-item" to="/" onClick={closeMenu}>
                                Home Page
                            </Link>
                        </li>
                        <li>
                            <Link className="text-gray-700 menu-item" to="/games" onClick={closeMenu}>
                                Game List
                            </Link>
                        </li>
                        <li>
                            <Link className="text-gray-700 menu-item" to="/about" onClick={closeMenu}>
                                About Us
                            </Link>
                        </li>
                        <li className="relative dropdown">
                            <Link to={`/games`} className="text-gray-700 menu-item" onClick={closeMenu}>
                                Game Store
                            </Link>
                            <GameCategoryDropDown categories={[]}/>
                        </li>
                        <li>
                            <Link className="text-gray-700 menu-item" to="/apologyPage" onClick={closeMenu}>
                                Help Centre
                            </Link>
                        </li>
                        <li>
                            <Link className="text-gray-700 menu-item" to="/apologyPage" onClick={closeMenu}>
                                FAQs
                            </Link>
                        </li>
                        <li>
                            <Link className="text-gray-700 menu-item" to="/apologyPage" onClick={closeMenu}>
                                Contact Us
                            </Link>
                        </li>
                    </ul>
                    <div className="flex flex-col lg:flex-row items-center gap-3 lg:gap-4 w-full lg:w-auto py-4 lg:py-0 border-t lg:border-0">
                        <CartIcon isText={false}></CartIcon>
                        {!keycloak.authenticated ? (
                            <LoginAndRegisterSection></LoginAndRegisterSection>
                        ) : (
                            <>
                                <span className="text-gray-700 font-semibold whitespace-nowrap">{accountLabel}</span>
                                {isAdmin && (
                                    <AdminPanelSection></AdminPanelSection>
                                )}
                                <LogOutButton/>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}
