import React, {useState, useEffect} from "react";
import {Link} from "react-router-dom";
import "./tale-gameshop-header.css";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import LogOutButton from "../logout-button/logout-button";
import GameCategoryDropDown from "../game-category-drop-down/game-category-drop-down";
import type {IKeycloakAuthService} from "../../iterfaces/i-keycloak-auth-service";
import {useKeycloak} from "@react-keycloak/web";
import {faBars, faTimes, faShoppingCart} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import { useCart } from "../../context/cart-context";

import logo from '../../assets/images/tale-shop-logo.jpeg';

export default function TaleGameshopHeader() {
    const {keycloak} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { state } = useCart();
    const totalItems = state.items.reduce((sum, item) => sum + item.quantity, 0); // Сумма количества товаров


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

    const login = async () => {
        if (!keycloak.authenticated) {
            await keycloakAuthService.loginWithRedirect(keycloak, window.location.href);
        }
    };

    const register = async () => {
        await keycloakAuthService.registerWithRedirect(keycloak, window.location.href);
    };

    return (
        <nav className="bg-white border-b border-gray-200 header-nav">
            <div className="container mx-auto flex justify-between items-center py-4">
                {/* Логотип */}
                <img className="lg:hidden w-14 h-14" src={logo} alt="Logo"/>

                {/* Бургер-иконка */}
                <button
                    className="lg:hidden text-gray-700 text-2xl"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                    <FontAwesomeIcon icon={isMenuOpen ? faTimes : faBars}/>
                </button>

                {/* Меню */}
                <ul
                    className={`text-center flex-col lg:flex-row flex lg:flex items-center space-y-4 lg:space-y-0 lg:space-x-6 absolute lg:static left-0 top-16 lg:top-auto bg-white lg:bg-transparent w-full lg:w-auto z-50 transition-transform duration-300 ${
                        isMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                    }`}
                >
                    <li className="hidden lg:flex">
                        {/* Логотип */}
                        <img className="w-14 h-14" src={logo} alt="Logo"/>
                    </li>
                    <li>
                        <Link className="text-gray-700 menu-item" to="/">
                            Home Page
                        </Link>
                    </li>
                    <li>
                        <Link className="text-gray-700 menu-item" to="/games">
                            Game List
                        </Link>
                    </li>
                    <li>
                        <Link className="text-gray-700 menu-item" to="/about">
                            About Us
                        </Link>
                    </li>
                    <li className="relative dropdown">
                        <Link to={`/games`} className="text-gray-700 menu-item">
                            More Games
                        </Link>
                        <GameCategoryDropDown categories={[]}/>
                    </li>

                    {/* Кнопки корзины, входа и регистрации */}
                    <div className="flex flex-col space-y-4 lg:hidden">
                        <Link to="/cart" className="cursor-pointer">
                            <FontAwesomeIcon className="hidden lg:flex text-2xl" icon={faShoppingCart}/>
                            <div className="lg:hidden text-gray-700 menu-item cursor-pointer">Cart</div>
                        </Link>
                        {!keycloak.authenticated ? (
                            <>
                                <button
                                    className="hidden lg:flex px-4 py-2 border border-gray-700 text-gray-700 animated-button cursor-pointer"
                                    onClick={login}
                                >
                                    Login
                                </button>
                                <div
                                    className="lg:hidden text-gray-700 menu-item cursor-pointer"
                                    onClick={login}>
                                    Login
                                </div>

                                <button
                                    className="hidden lg:flex px-4 py-2 bg-black text-white animated-button cursor-pointer"
                                    onClick={register}
                                >
                                    Sign Up
                                </button>
                                <div
                                    className="lg:hidden text-gray-700 menu-item cursor-pointer"
                                    onClick={register}>
                                    Sign Up
                                </div>
                                <div className="lg:hidden h-0"></div>
                            </>
                        ) : (
                            <>
                                <span className="text-gray-700">{email}</span>
                                {isAdmin && (
                                    <>
                                        <Link className="hidden lg:flex px-4 py-2 bg-red-500 text-white" to="/admin">
                                            Open Admin Panel
                                        </Link>
                                        <Link className="lg:hidden text-gray-700 menu-item cursor-pointer" to="/admin">
                                            Open Admin Panel
                                        </Link>
                                    </>
                                )}
                                <LogOutButton/>
                            </>
                        )}
                    </div>
                </ul>

                {/* Корзина и кнопки для больших экранов */}
                <div className="hidden lg:flex space-x-4 items-center">
                    <Link to="/cart" className="cursor-pointer relative">
                        <FontAwesomeIcon className="text-2xl" icon={faShoppingCart} />
                        {totalItems > 0 && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                {totalItems}
                            </span>
                        )}
                    </Link>
                    {!keycloak.authenticated ? (
                        <>
                            <button
                                className="hidden lg:flex px-4 py-2 border border-gray-700 text-gray-700 animated-button cursor-pointer"
                                onClick={login}
                            >
                                Login
                            </button>
                            <div
                                className="lg:hidden text-gray-700 menu-item cursor-pointer"
                                onClick={login}>
                                Login
                            </div>
                            <button
                                className="hidden lg:flex px-4 py-2 bg-black text-white animated-button cursor-pointer"
                                onClick={register}
                            >
                                Sign Up
                            </button>
                            <div
                                className="lg:hidden text-gray-700 menu-item cursor-pointer"
                                onClick={register}>
                                Sign Up
                            </div>
                        </>
                    ) : (
                        <>
                            <span className="mr-2">{email}</span>
                            {isAdmin && (
                                <>
                                    <Link className="hidden lg:flex px-4 py-2 bg-red-500 text-white" to="/admin">
                                        Open Admin Panel
                                    </Link>
                                    <Link className="lg:hidden text-gray-700 menu-item cursor-pointer" to="/admin">
                                        Open Admin Panel
                                    </Link>
                                </>
                            )}
                            <LogOutButton/>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}
