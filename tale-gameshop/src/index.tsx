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
import {WishlistProvider} from './context/wishlist-context';
import AppLoader from './components/app-loader/AppLoader';
import AppErrorBoundary from './components/utils/error-boundary/AppErrorBoundary';
import MiniAppPage from './features/miniapp/MiniAppPage';

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);

// Telegram Mini App (/tg) авторизуется через Telegram initData, а НЕ через Keycloak.
// Рендерим витрину напрямую, минуя keycloak-бутстрап (иначе в webview Telegram сплэш висит
// бесконечно — silent check-sso не проходит из-за блокировки сторонних cookie).
const isMiniApp = window.location.pathname.startsWith('/tg');

if (isMiniApp) {
    root.render(
        <React.StrictMode>
            <AppErrorBoundary>
                <MiniAppPage/>
            </AppErrorBoundary>
        </React.StrictMode>
    );
} else {
    const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);

    root.render(
        <ReactKeycloakProvider authClient={keycloakService.keycloak} initOptions={keycloakService.initOptions}
                               onEvent={keycloakService.eventHandlers.bind(keycloakService)}
                               LoadingComponent={<AppLoader/>}>
            <ReduxProvider store={store}>
                <InversifyProvider container={container}>
                    <React.StrictMode>
                        <AppErrorBoundary>
                            <CartProvider>
                                <WishlistProvider>
                                    <BrowserRouter>
                                        <App/>
                                    </BrowserRouter>
                                </WishlistProvider>
                            </CartProvider>
                        </AppErrorBoundary>
                    </React.StrictMode>
                </InversifyProvider>
            </ReduxProvider>
        </ReactKeycloakProvider>
    );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
