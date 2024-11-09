import React from "react";
import {Link, Route, Router, Routes, useLocation, useNavigate} from "react-router-dom";
import './tale-gameshop-header.css'
import TaleGameshopGameList from "../game-list-page/game-list-page";
import LoginPage from "../login-page/login-page";

export default function TaleGameshopHeader() {
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

                            <ul className="absolute left-0 mt-2 w-64 bg-white border border-gray-200 shadow-lg hidden dropdown-menu p-4">
                                <li className="font-bold accordion-item">
                                    <a className="text-gray-700 menu-item" href="#">
                                        Action
                                    </a>
                                    <ul className="accordion-content">
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Platformers
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Fighting
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Shooter
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Stealth
                                            </a>
                                        </li>
                                    </ul>
                                </li>
                                <li className="font-bold accordion-item mt-4">
                                    <a className="text-gray-700 menu-item" href="#">
                                        Adventure
                                    </a>
                                    <ul className="accordion-content">
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Graphic Adventure
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Text Adventure
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Interactive Fiction
                                            </a>
                                        </li>
                                    </ul>
                                </li>
                                <li className="font-bold accordion-item mt-4">
                                    <a className="text-gray-700 menu-item" href="#">
                                        Role-Playing Games (RPGs)
                                    </a>
                                    <ul className="accordion-content">
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Western RPG
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Japanese RPG
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Tactical RPG
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Action RPG
                                            </a>
                                        </li>
                                    </ul>
                                </li>
                                <li className="font-bold accordion-item mt-4">
                                    <a className="text-gray-700 menu-item" href="#">
                                        Simulation
                                    </a>
                                    <ul className="accordion-content">
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Life Simulation
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Flight Simulation
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Vehicle Simulation
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Farming Simulation
                                            </a>
                                        </li>
                                    </ul>
                                </li>
                                <li className="font-bold accordion-item mt-4">
                                    <a className="text-gray-700 menu-item" href="#">
                                        Strategy
                                    </a>
                                    <ul className="accordion-content">
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Real-Time Strategy (RTS)
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Turn-Based Strategy (TBS)
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Tower Defense
                                            </a>
                                        </li>
                                    </ul>
                                </li>
                                <li className="font-bold accordion-item mt-4">
                                    <a className="text-gray-700 menu-item" href="#">
                                        Puzzle
                                    </a>
                                    <ul className="accordion-content">
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Logic Puzzles
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Match-3
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Word Puzzles
                                            </a>
                                        </li>
                                    </ul>
                                </li>
                                <li className="font-bold accordion-item mt-4">
                                    <a className="text-gray-700 menu-item" href="#">
                                        Sports
                                    </a>
                                    <ul className="accordion-content">
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Team Sports
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Racing
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Fitness
                                            </a>
                                        </li>
                                    </ul>
                                </li>
                                <li className="font-bold accordion-item mt-4">
                                    <a className="text-gray-700 menu-item" href="#">
                                        Card and Board Games
                                    </a>
                                    <ul className="accordion-content">
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Trading Card Games (TCGs)
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Board Games
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Dice Games
                                            </a>
                                        </li>
                                    </ul>
                                </li>
                                <li className="font-bold accordion-item mt-4">
                                    <a className="text-gray-700 menu-item" href="#">
                                        Massively Multiplayer Online (MMO)
                                    </a>
                                    <ul className="accordion-content">
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                MMORPG
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                MMOFPS
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                MMORTS
                                            </a>
                                        </li>
                                    </ul>
                                </li>
                                <li className="font-bold accordion-item mt-4">
                                    <a className="text-gray-700 menu-item" href="#">
                                        Horror
                                    </a>
                                    <ul className="accordion-content">
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Survival Horror
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Psychological Horror
                                            </a>
                                        </li>
                                    </ul>
                                </li>
                                <li className="font-bold accordion-item mt-4">
                                    <a className="text-gray-700 menu-item" href="#">
                                        Casual Games
                                    </a>
                                    <ul className="accordion-content">
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Mobile Games
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Party Games
                                            </a>
                                        </li>
                                    </ul>
                                </li>
                                <li className="font-bold accordion-item mt-4">
                                    <a className="text-gray-700 menu-item" href="#">
                                        Educational Games
                                    </a>
                                    <ul className="accordion-content">
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Trivia
                                            </a>
                                        </li>
                                        <li>
                                            <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                                                Language Learning
                                            </a>
                                        </li>
                                    </ul>
                                </li>
                            </ul>
                        </li>
                    </ul>

                </div>
                <div className="flex space-x-4">
                    <Link className="px-4 py-2 border border-gray-700 text-gray-700 animated-button" to="/login">Login</Link>
                    <Link className="px-4 py-2 bg-black text-white animated-button" to="/signUp">Sign Up</Link>
                </div>
            </div>
        </nav>
    );
}