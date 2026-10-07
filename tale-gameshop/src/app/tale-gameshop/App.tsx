import React from 'react';
import './App.css';
import TaleGameshopMainWindow from "../../components/tale-gameshop-main-window/tale-gameshop-main-window";
import { ToastProvider } from "../../components/ui/ToastProvider";
import SessionExpiredNotice from "../../components/session-expired/SessionExpiredNotice";
import DemoLayer from "../../features/demo/DemoLayer";
function App() {
  return (
    <ToastProvider>
      {/* Демо-сайт для портфолио: полоска «демо» и своя копия магазина. На обычном магазине ничего не рисует. */}
      <DemoLayer />
      <TaleGameshopMainWindow />
      <SessionExpiredNotice />
    </ToastProvider>
  );
}

export default App;
