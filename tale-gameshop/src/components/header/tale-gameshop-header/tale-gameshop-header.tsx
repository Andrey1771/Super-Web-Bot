import React, {useState, useEffect} from "react";
import {Link} from "react-router-dom";
import "./tale-gameshop-header.css";
import {useKeycloak} from "@react-keycloak/web";
import {faBars, faTimes, faUserCircle, faStore} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import logo from '../../../assets/images/tale-shop-logo.jpeg';
import CartIcon from "../../cart/cart-icon/cart-icon";
import LoginAndRegisterSection from "../login-and-register-section/login-and-register-section";
import container from "../../../inversify.config";
import type {IKeycloakAuthService} from "../../../iterfaces/i-keycloak-auth-service";
import IDENTIFIERS from "../../../constants/identifiers";

export default function TaleGameshopHeader() {
    const {keycloak} = useKeycloak();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
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

    const isAdmin = keycloak.tokenParsed?.resource_access?.["tale-shop-app"]?.["roles"].some(
        (role) => role === "admin"
    );

    const toggleProfile = () => setIsProfileOpen((prev) => !prev);

    const handleLogout = async () => {
        await keycloakAuthService.logoutWithRedirect(keycloak, window.location.href);
        setIsProfileOpen(false);
    };

    const closeMobileMenu = () => setIsMenuOpen(false);

    const profileInitial = (keycloak.tokenParsed?.name || keycloak.tokenParsed?.preferred_username || 'Профиль')
        .slice(0, 1)
        .toUpperCase();

    const navLinks = [
        {label: 'Главная', to: '/'},
        {label: 'Каталог', to: '/games'},
        {label: 'О сервисе', to: '/about'}
    ];

    const profileMenuItems = [
        {label: 'Каталог', to: '/games'},
        {label: 'О сервисе', to: '/about'},
    ];

    return (
        <nav className="bg-white border-b border-gray-200 header-nav">
            <div className="header-inner flex justify-between items-center py-4">
                <div className="flex items-center gap-3">
                    <button
                        className="lg:hidden text-gray-700 text-2xl w-12 h-12"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        aria-label="Toggle navigation"
                    >
                        <FontAwesomeIcon icon={isMenuOpen ? faTimes : faBars}/>
                    </button>
                    <Link to="/" className="flex items-center gap-3" onClick={closeMobileMenu}>
                        <img className="w-12 h-12" src={logo} alt="TaleShop logo"/>
                        <span className="font-semibold hidden sm:inline">TaleShop</span>
                    </Link>
                </div>

                <ul
                    className={`flex flex-col lg:flex-row lg:items-center lg:space-x-6 absolute lg:static left-0 top-16 lg:top-auto bg-white lg:bg-transparent w-full lg:w-auto z-50 transition-transform duration-300 ${
                        isMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                    }`}
                >
                    {navLinks.map((link) => (
                        <li key={link.to} className="border-b border-gray-100 lg:border-none">
                            <Link className="block px-6 py-3 lg:px-0 text-gray-700 menu-item" to={link.to} onClick={closeMobileMenu}>
                                {link.label}
                            </Link>
                        </li>
                    ))}
                    <li className="lg:hidden border-b border-gray-100">
                        <Link className="block px-6 py-3 text-gray-700 menu-item" to="/games" onClick={closeMobileMenu}>
                            <FontAwesomeIcon icon={faStore} className="mr-2"/> Магазин
                        </Link>
                    </li>
                    <li className="lg:hidden px-6 py-4">
                        <CartIcon isText={true}></CartIcon>
                    </li>
                    {!keycloak.authenticated && (
                        <li className="lg:hidden px-6 py-2 border-t border-gray-100">
                            <LoginAndRegisterSection></LoginAndRegisterSection>
                        </li>
                    )}
                    {keycloak.authenticated && (
                        <li className="lg:hidden px-6 py-3 border-t border-gray-100 space-y-2 text-left">
                            <Link to="/games" className="block text-gray-700" onClick={closeMobileMenu}>Каталог</Link>
                            <Link to="/about" className="block text-gray-700" onClick={closeMobileMenu}>О сервисе</Link>
                            {isAdmin && (
                                <Link to="/admin" className="block text-gray-700" onClick={closeMobileMenu}>Админка</Link>
                            )}
                            <button
                                className="text-left text-gray-700 hover:text-gray-900"
                                onClick={handleLogout}
                            >
                                Выйти
                            </button>
                        </li>
                    )}
                </ul>

                <div className="hidden lg:flex space-x-4 items-center">
                    <CartIcon isText={false}></CartIcon>
                    {!keycloak.authenticated ? (
                        <LoginAndRegisterSection></LoginAndRegisterSection>
                    ) : (
                        <div className="relative">
                            <button
                                className="flex items-center gap-2 px-3 py-2 rounded-full border border-gray-200 hover:border-gray-300 shadow-sm"
                                onClick={toggleProfile}
                            >
                                <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold">
                                    {profileInitial}
                                </div>
                                <span className="text-sm font-semibold text-gray-700">Профиль</span>
                                <FontAwesomeIcon icon={faUserCircle} className="text-gray-500"/>
                            </button>
                            {isProfileOpen && (
                                <div className="absolute right-0 mt-3 w-60 bg-white border border-gray-200 rounded-xl shadow-lg py-2">
                                    <div className="px-4 pb-2 text-xs text-gray-500">TALESHOP аккаунт</div>
                                    {profileMenuItems.map((item) => (
                                        <Link
                                            key={item.to}
                                            to={item.to}
                                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                            onClick={() => setIsProfileOpen(false)}
                                        >
                                            {item.label}
                                        </Link>
                                    ))}
                                    {isAdmin && (
                                        <Link
                                            to="/admin"
                                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                            onClick={() => setIsProfileOpen(false)}
                                        >
                                            Админка
                                        </Link>
                                    )}
                                    <button
                                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
                                        onClick={handleLogout}
                                    >
                                        Выйти
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}
