import React from "react";
import TaleGameshopHeader from "../tale-gameshop-header/tale-gameshop-header";
import TaleGameshopFooter from "../tale-gameshop-footer/tale-gameshop-footer";
import TaleGameshopMainPage from "../tale-gameshop-main-page/tale-gameshop-main-page";
import './tale-gameshop-main-window.css'

export default function TaleGameshopMainWindow() {
    return (
        <div>
            <TaleGameshopHeader></TaleGameshopHeader>
            <TaleGameshopMainPage></TaleGameshopMainPage>
            <TaleGameshopFooter></TaleGameshopFooter>
        </div>
    );
}