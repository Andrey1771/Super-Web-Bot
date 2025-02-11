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


    return (
        <nav className="bg-white border-b border-gray-200 header-nav">
            <div className="container mx-auto flex justify-between items-center py-4 px-4 sm:px-0">
                {/* Логотип */}
                <img className="lg:hidden w-14 h-14 ml-4 sm:ml-0" src={logo} alt="Logo"/>

                {/* Бургер-иконка */}
                <button
                    className="lg:hidden text-gray-700 text-2xl w-14 h-14"
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
                        <CartIcon  isText={true}></CartIcon>
                        {!keycloak.authenticated ? (
                            <LoginAndRegisterSection></LoginAndRegisterSection>
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
                    <CartIcon  isText={false}></CartIcon>
                    {!keycloak.authenticated ? (
                        <LoginAndRegisterSection></LoginAndRegisterSection>
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
