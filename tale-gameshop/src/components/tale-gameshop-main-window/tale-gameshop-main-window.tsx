import React from "react";
import TaleGameshopHeader from "../tale-gameshop-header/tale-gameshop-header";
import TaleGameshopFooter from "../tale-gameshop-footer/tale-gameshop-footer";
import TaleGameshopMainPage from "../tale-gameshop-main-page/tale-gameshop-main-page";
import './tale-gameshop-main-window.css'
import {Route, Routes} from "react-router-dom";
import TaleGameshopGameList from "../game-list-page/game-list-page";
import AboutUs from "../about-us/about-us";
import LoginPage from "../login-page/login-page";
import RegistrationPage from "../registration-page/registration-page";
import ChatBot from "../bot/chat-bot/chat-bot";
import AdminPanelPage from "../admin-panel-page/admin-panel-page";
import Callback from "../callback-page/callback-page";
import CallbackPage from "../callback-page/callback-page";

export default function TaleGameshopMainWindow() {
    return (
        <div>
            <TaleGameshopHeader></TaleGameshopHeader>
            <div className="main-page-down-header-padding"></div>
                <Routes>
                    <Route path="/" element={<TaleGameshopMainPage/>}/>
                    <Route path="/games" element={<TaleGameshopGameList/>}/>
                    <Route path="/about" element={<AboutUs/>}/>
                    <Route path="/logIn" element={<LoginPage/>}/>
                    <Route path="/signUp" element={<RegistrationPage/>}/>
                    <Route path="/admin" element={<AdminPanelPage/>}/>
                    <Route path="/callback" element={<CallbackPage/>}/>
                </Routes>
            <TaleGameshopFooter></TaleGameshopFooter>
            <ChatBot></ChatBot>
        </div>
    );
}