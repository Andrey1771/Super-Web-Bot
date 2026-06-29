import React, { useEffect, useState } from 'react';
import './app-loader.css';
import logo from '../../assets/images/tale-shop-logo.svg';

// Задержка перед показом: если Keycloak инициализируется быстрее — лоадер не появляется вовсе
// (никакого мигания). Контент при этом не задерживается, минимального времени показа нет.
const SHOW_DELAY_MS = 150;

const AppLoader: React.FC = () => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, []);

    if (!visible) {
        return null;
    }

    return (
        <div className="app-loader" role="status" aria-live="polite" aria-busy="true">
            <div className="app-loader__stage">
                <span className="app-loader__glow" />
                <span className="app-loader__ring" />
                <img className="app-loader__logo" src={logo} alt="Tale Shop" />
            </div>
            <div className="app-loader__text">
                <div className="app-loader__brand">Tale Shop</div>
                <div className="app-loader__tagline">Curated PC games</div>
            </div>
        </div>
    );
};

export default AppLoader;
