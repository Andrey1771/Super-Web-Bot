import React, {useEffect} from "react";
import {Link} from "react-router-dom";
import './tale-gameshop-header.css'
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import LogOutButton from "../logout-button/logout-button";
import GameCategoryDropDown from "../game-category-drop-down/game-category-drop-down";
import type {IKeycloakAuthService} from "../../iterfaces/i-keycloak-auth-service";
import { useKeycloak } from "@react-keycloak/web";

export default function TaleGameshopHeader() {
    const { keycloak } = useKeycloak();

    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);

    //Todo Временно
    document.addEventListener('DOMContentLoaded', function () {
        const accordionItems = document.querySelectorAll('.accordion-item');
        accordionItems.forEach(item => {
            item.addEventListener('click', function () {
                // @ts-ignore
                this.classList.toggle('open');
            });
        });
    });

    useEffect(() => {
        // Функция для обработки скролла
        const handleScroll = () => {
            const header = document.querySelector('.header-nav');
            if (window.scrollY > 0) {
                header?.classList.add('scrolled');
            } else {
                header?.classList.remove('scrolled');
            }
        };

        window.addEventListener('scroll', handleScroll);
        // Очистка события при размонтировании компонента
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // @ts-ignore Тип возвращаемых данных и объекта keycloak отличается
    const isAdmin = keycloak.tokenParsed?.resource_access?.["tale-shop-app"]?.["roles"].some(role => role === "admin");
    // @ts-ignore Тип возвращаемых данных и объекта keycloak отличается
    const email = keycloak.tokenParsed?.email;

    const login = async () => {
        try {
            // Проверка, аутентифицирован ли пользователь
            if (!keycloak.authenticated) {
                console.log('Пользователь не аутентифицирован, выполняем логин...');
                await keycloakAuthService.loginWithRedirect(keycloak, window.location.href);
            } else {
                console.log('Пользователь уже аутентифицирован:', keycloak.tokenParsed);
            }
        } catch (error) {
            console.error('Ошибка инициализации приложения:', error);
        }
    }

    const register = async () => {
        try {
            await keycloakAuthService.registerWithRedirect(keycloak, window.location.href);
        } catch (error) {
            console.error('Ошибка инициализации приложения:', error);
        }
    }

    return (
        <nav className="bg-white border-b border-gray-200 header-nav">
            <div className="container mx-auto flex justify-between items-center py-4">
                <div className="flex items-center">
                    <img className="text-2xl font-bold" src="../../../public/shop_tale_logo.svg">

                    </img>
                    <ul className="flex space-x-6 ml-10">
                        <li>
                            <Link className="text-gray-700 menu-item" to="/">Home Page</Link>
                        </li>
                        <li>
                            <Link className="text-gray-700 menu-item" to="/games">Game List</Link>
                        </li>
                        <li>
                            <Link className="text-gray-700 menu-item" to="/about">About Us</Link>
                        </li>

                        <li className="relative dropdown">
                            <a className="text-gray-700 menu-item" href="#">
                                More Games
                                <i className="fas fa-chevron-down">
                                </i>
                            </a>

                            <GameCategoryDropDown categories={[]}></GameCategoryDropDown>
                        </li>
                    </ul>

                </div>
                <div className="flex space-x-4">
                    {
                        !keycloak.authenticated ? (
                            <React.Fragment>
                                <a className="px-4 py-2 border border-gray-700 text-gray-700 animated-button  cursor-pointer"
                                   onClick={login}>Login</a>
                                <a className="px-4 py-2 bg-black text-white animated-button cursor-pointer"
                                   onClick={register}>Sign Up</a>
                            </React.Fragment>
                        ) : (
                            <React.Fragment>
                            <div className="flex items-center justify-between">
                                    <div className="mr-2">{email}</div>
                                    {isAdmin && (
                                        <Link className="px-4 py-2 bg-red-500 text-white transition"
                                              to="/admin">Open Admin Panel</Link>
                                    )}
                                    <LogOutButton/>
                                </div>
                            </React.Fragment>
                        )
                    }
                </div>
            </div>
        </nav>
    );
}