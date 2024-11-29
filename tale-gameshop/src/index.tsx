import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './app/tale-gameshop/App';
import reportWebVitals from './reportWebVitals';
import {BrowserRouter, Route, Routes} from "react-router-dom";
import TaleGameshopGameList from "./components/game-list-page/game-list-page";
import {Provider as InversifyProvider} from 'inversify-react';
import container from './inversify.config';
import {store} from './store';
import {Provider as ReduxProvider} from 'react-redux';
import {AuthProvider} from 'react-oidc-context'
import {WebStorageStateStore} from "oidc-client-ts";
const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);
const oidcConfig = {
    authority: 'http://localhost:8180/realms/Tale-Shop', // URL вашего Realm
    client_id: 'tale-shop-app', // ID клиента в Keycloak
    redirect_uri: 'http://localhost:3000/callback', // URL редиректа после входа
    post_logout_redirect_uri: 'http://localhost:3000', // URL после выхода
    response_type: 'code', // Используем Authorization Code Flow
    scope: 'openid profile email', // Запрашиваемые скоупы
    loadUserInfo: true, // Получение дополнительной информации о пользователе
    stateStore: new WebStorageStateStore({ store: window.localStorage }), // Хранилище состояния
    silent_redirect_uri: 'http://localhost:3000/silent-renew', // URL для тихого обновления токенов
    client_secret: "VacIN0mdxlOlEnyjuEQNffZVrt2gO8Kq",
};

root.render(
    <AuthProvider {...oidcConfig}>
    <ReduxProvider store={store}>
        <InversifyProvider container={container}>
            <React.StrictMode>
                <BrowserRouter>
                    <App/>
                </BrowserRouter>
            </React.StrictMode>
        </InversifyProvider>
    </ReduxProvider>
        </AuthProvider>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
