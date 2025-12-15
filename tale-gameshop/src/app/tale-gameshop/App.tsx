import React from 'react';
import './App.css';
import TaleGameshopMainWindow from "../../components/tale-gameshop-main-window/tale-gameshop-main-window";

function App() {
  return (
    <div className="app-shell">
      <main className="app-main">
        <TaleGameshopMainWindow />
      </main>
    </div>
  );
}

export default App;
