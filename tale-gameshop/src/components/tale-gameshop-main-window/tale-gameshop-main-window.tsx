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
import AdminPanelPage from "../admin-panel/admin-panel-page/admin-panel-page";
import CallbackPage from "../callback-page/callback-page";
import PrivateRoute from "../utils/private-route/private-route";
import BotChangerPage from "../admin-panel/bot-changer-page/bot-changer-page";
import SiteChangerPage from "../admin-panel/site-changer-page/site-changer-page";
import CardAdderPage from "../admin-panel/card-adder-page/card-adder-page";
import {CartPage} from "../cart/cart-page/cart-page";
import CheckoutPage from "../cart/checkout-page/checkout-page";
import SuccessPurchasePage from "../cart/success-purchase-page/success-purchase-page";

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
                    <Route path="/admin" element={<PrivateRoute><AdminPanelPage/></PrivateRoute>}/>
                    <Route path="/admin/botChanger" element={<PrivateRoute><BotChangerPage/></PrivateRoute>}/>
                    <Route path="/admin/siteChanger" element={<PrivateRoute><SiteChangerPage/></PrivateRoute>}/>
                    <Route path="/admin/cardAdder" element={<PrivateRoute><CardAdderPage/></PrivateRoute>}/>
                    <Route path="/callback" element={<CallbackPage/>}/>
                    <Route path="/cart" element={<CartPage/>}/>
                    <Route path="/checkout" element={<CheckoutPage/>}/>
                    <Route path="/successPurchasePage" element={<SuccessPurchasePage/>}/>
                </Routes>
            <TaleGameshopFooter></TaleGameshopFooter>
            <ChatBot></ChatBot>
        </div>
    );
}