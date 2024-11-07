import React from "react";
import TaleGameshopHeader from "../tale-gameshop-header/tale-gameshop-header";
import TaleGameshopFooter from "../tale-gameshop-footer/tale-gameshop-footer";
import TaleGameshopMainPage from "../tale-gameshop-main-page/tale-gameshop-main-page";
import './tale-gameshop-main-window.css'
import {Route, Routes} from "react-router-dom";
import TaleGameshopGameList from "../game-list-page/game-list-page";

export default function TaleGameshopMainWindow() {
    return (
        <div>
            <TaleGameshopHeader></TaleGameshopHeader>
                <Routes>
                    <Route path="/" element={<TaleGameshopMainPage/>}/>
                    <Route path="/games" element={<TaleGameshopGameList/>}/>
                    <Route path="/about" element={<TaleGameshopGameList/>}/>
                </Routes>
            <TaleGameshopFooter></TaleGameshopFooter>
        </div>
    );
}