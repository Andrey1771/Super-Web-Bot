import React from 'react';
import './App.css';
import TaleGameshopMainWindow from "../../components/tale-gameshop-main-window/tale-gameshop-main-window";
import { ToastProvider } from "../../components/ui/ToastProvider";
function App() {
  return (
    <ToastProvider>
      <TaleGameshopMainWindow />
    </ToastProvider>
  );
}

export default App;
