import React from 'react';
import './App.css';
import TaleGameshopMainWindow from "../../components/tale-gameshop-main-window/tale-gameshop-main-window";
import { ToastProvider } from "../../components/ui/ToastProvider";
import SessionExpiredNotice from "../../components/session-expired/SessionExpiredNotice";
function App() {
  return (
    <ToastProvider>
      <TaleGameshopMainWindow />
      <SessionExpiredNotice />
    </ToastProvider>
  );
}

export default App;
