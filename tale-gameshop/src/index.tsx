import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './app/tale-gameshop/App';
import reportWebVitals from './reportWebVitals';
import {BrowserRouter} from "react-router-dom";
import ScrollToTop from "./components/common/ScrollToTop";
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


/**
 * Убирает стартовую заставку, когда приложение уже нарисовано.
 *
 * Ждём не сам вызов render (он возвращает управление до отрисовки), а появление первого
 * узла в #root: иначе заставка успела бы погаснуть раньше содержимого и человек увидел бы
 * вспышку пустого фона — ровно то, ради чего заставка и существует.
 */
const dismissBootSplash = () => {
    const splash = document.getElementById('boot-splash');
    const appRoot = document.getElementById('root');
    if (!splash || !appRoot) {
        return;
    }

    const finish = () => {
        splash.classList.add('is-hidden');
        // Снимаем узел после перехода; таймер — страховка на случай, когда transitionend
        // не приходит (вкладка в фоне, отключённые анимации).
        const remove = () => splash.remove();
        splash.addEventListener('transitionend', remove, { once: true });
        window.setTimeout(remove, 800);
    };

    const waitForPaint = () => {
        if (appRoot.childElementCount > 0) {
            // Ещё кадр: даём браузеру показать содержимое до того, как заставка поедет.
            window.requestAnimationFrame(finish);
            return;
        }
        window.requestAnimationFrame(waitForPaint);
    };

    window.requestAnimationFrame(waitForPaint);
};

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
        // LoadingComponent намеренно НЕ задан. С ним провайдер не рендерил детей, пока
        // Keycloak не ответит, — то есть весь магазин ждал скрытый iframe check-sso на
        // сервере авторизации. Каталог, поиск, карточки игр анонимны и этого ответа не
        // требуют, поэтому заставка показывалась всем и на каждом заходе без всякой пользы.
        //
        // Теперь личность — это данные, которые приходят позже: страница рисуется сразу, а
        // шапка подставляет вход или аккаунт, когда ответ придёт. Ожидание осталось там, где
        // оно честное: гейты /account и /admin показывают ту же заставку, пока не выяснят,
        // кто пришёл (см. authorized-route и private-route).
        <ReactKeycloakProvider authClient={keycloakService.keycloak} initOptions={keycloakService.initOptions}
                               onEvent={keycloakService.eventHandlers.bind(keycloakService)}>
            <ReduxProvider store={store}>
                {/* Сервисы берутся прямо из контейнера (container.get): React-контекст для него не нужен. */}
                <React.StrictMode>
                    <AppErrorBoundary>
                        <CartProvider>
                            <WishlistProvider>
                                <BrowserRouter>
                                    <ScrollToTop/>
                                    <App/>
                                </BrowserRouter>
                            </WishlistProvider>
                        </CartProvider>
                    </AppErrorBoundary>
                </React.StrictMode>
            </ReduxProvider>
        </ReactKeycloakProvider>
    );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
dismissBootSplash();

reportWebVitals();
