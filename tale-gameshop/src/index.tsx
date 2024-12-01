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
import { KeycloakService } from './services/keycloak-service';

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);

const keycloakService = new KeycloakService();
//(async () => keycloakService.initialiseKeycloak())();

root.render(
    <ReactKeycloakProvider authClient={keycloakService.keycloak} initOptions={keycloakService.initOptions}>
        <ReduxProvider store={store}>
            <InversifyProvider container={container}>
                <React.StrictMode>
                    <BrowserRouter>
                        <App/>
                    </BrowserRouter>
                </React.StrictMode>
            </InversifyProvider>
        </ReduxProvider>
    </ReactKeycloakProvider>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
