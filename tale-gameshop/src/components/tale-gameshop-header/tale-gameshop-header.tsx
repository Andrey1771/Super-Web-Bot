import React, {useEffect} from "react";
import {Link} from "react-router-dom";
import './tale-gameshop-header.css'
import container from "../../inversify.config";
import type {IAuthStorageService} from "../../iterfaces/i-auth-storage-service";
import IDENTIFIERS from "../../constants/identifiers";
import {decodeToken} from "../../utils/token-utils";
import LogOutButton from "../logout-button/logout-button";
import {useDispatch, useSelector} from "react-redux";
import GameCategoryDropDown from "../game-category-drop-down/game-category-drop-down";

export default function TaleGameshopHeader() {
    const jwt = useSelector((state: any) => state.jwt);
    const dispatch = useDispatch();

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
        const tokenStorage = container.get<IAuthStorageService>(IDENTIFIERS.IAuthStorageService);
        const newToken = tokenStorage.getItem("token");
        const newJwt = newToken ? decodeToken(newToken) : null;

        dispatch({type: 'SET_JWT', payload: newJwt});


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
                        !jwt ? (
                            <React.Fragment>
                                <Link
                                    state={{jwt: jwt}}
                                    className="px-4 py-2 border border-gray-700 text-gray-700 animated-button"
                                    to="/login"
                                >
                                    Login
                                </Link>
                                <Link
                                    className="px-4 py-2 bg-black text-white animated-button"
                                    to="/signUp"
                                >
                                    Sign Up
                                </Link>
                            </React.Fragment>
                        ) : (
                            <React.Fragment>
                                <div className="flex items-center justify-between">
                                    <div className="mr-2">{jwt.unique_name}</div>
                                    {jwt?.role === "admin" && (
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