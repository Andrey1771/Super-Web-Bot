import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './app/tale-gameshop/App';
import reportWebVitals from './reportWebVitals';
import {BrowserRouter} from "react-router-dom";
import {Provider as InversifyProvider} from 'inversify-react';
import container from './inversify.config';
import {store} from './store';
import {Provider as ReduxProvider} from 'react-redux';
import {ReactKeycloakProvider} from "@react-keycloak/web";
import {IKeycloakService} from "./iterfaces/i-keycloak-service";
import IDENTIFIERS from "./constants/identifiers";
import {CartProvider} from './context/cart-context';

import { Buffer } from "buffer"; // Принудительно импортируем Buffer
global.Buffer = Buffer; // Делаем Buffer глобальным

import crypto from "crypto-browserify";

if (!global.crypto) {
    global["crypto"] = crypto;
}

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);

const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);

root.render(
    <ReactKeycloakProvider authClient={keycloakService.keycloak} initOptions={keycloakService.initOptions}
                           onEvent={keycloakService.eventHandlers.bind(keycloakService)}>
        <ReduxProvider store={store}>
            <InversifyProvider container={container}>
                <React.StrictMode>
                    <CartProvider>
                        <BrowserRouter>
                            <App/>
                        </BrowserRouter>
                    </CartProvider>
                </React.StrictMode>
            </InversifyProvider>
        </ReduxProvider>
    </ReactKeycloakProvider>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
