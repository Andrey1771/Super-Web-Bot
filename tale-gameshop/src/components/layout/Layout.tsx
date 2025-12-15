import React from 'react';
import TaleGameshopHeader from "../header/tale-gameshop-header/tale-gameshop-header";
import TaleGameshopFooter from "../tale-gameshop-footer/tale-gameshop-footer";
import ChatBot from "../bot/chat-bot/chat-bot";
import './Layout.css';

interface LayoutProps {
    children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({children}) => {
    return (
        <div className="app-shell">
            <TaleGameshopHeader/>
            <main className="app-main">
                {children}
            </main>
            <TaleGameshopFooter/>
            <ChatBot/>
        </div>
    );
};

export default Layout;
