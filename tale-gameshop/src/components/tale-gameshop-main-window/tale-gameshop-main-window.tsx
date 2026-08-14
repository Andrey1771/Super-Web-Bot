import React, { Suspense, lazy, useRef } from "react";
import TaleGameshopHeader from "../header/tale-gameshop-header/tale-gameshop-header";
import useScrollReveal from "../../hooks/use-scroll-reveal";
import TaleGameshopFooter from "../tale-gameshop-footer/tale-gameshop-footer";
import TaleGameshopMainPage from "../tale-gameshop-main-page/tale-gameshop-main-page";
import './tale-gameshop-main-window.css'
import {Navigate, Route, Routes, useLocation, useParams} from "react-router-dom";
import TaleGameshopGameList from "../game-list-page/game-list-page";
import AboutUs from "../about-us/about-us";
import LoginPage from "../login-page/login-page";
import RegistrationPage from "../registration-page/registration-page";
import ChatWidget from "../support-chat/ChatWidget";
import CallbackPage from "../callback-page/callback-page";
import PrivateRoute from "../utils/private-route/private-route";
import AuthorizedRoute from "../utils/authorized-route/authorized-route";
import NotFoundPage from "../utils/not-found-page/not-found-page";
import {CartPage} from "../cart/cart-page/cart-page";
import CheckoutPage from "../cart/checkout-page/checkout-page";
import SuccessPurchasePage from "../cart/success-purchase-page/success-purchase-page";
import DeliveryConfirmedPage from "../cart/delivery-confirmed-page/delivery-confirmed-page";
import CancelPurchasePage from "../cart/cancel-purchase-page";
import ApologyPage from "../apology-page/apology-page";
import SupportPage from "../support-page/support-page";
import SupportDocPage from "../support-docs/support-doc-page";
import BlogPage from "../blog-page/blog-page";
import BlogPostPage from "../blog-page/blog-post-page";
import DealsPage from "../deals-page/deals-page";
import FaqPage from "../faq-page/faq-page";
import NewsletterConfirmPage from "../newsletter/NewsletterConfirmPage";
import NewsletterUnsubscribePage from "../newsletter/NewsletterUnsubscribePage";
import GameDetailsPage from "../../pages/game-details-page/GameDetailsPage";
import AccountRoutes from "../../features/account/routes/AccountRoutes";
import AnalyticsProvider from "../analytics/AnalyticsProvider";
import CookieBanner from "../analytics/CookieBanner";
import AccountRecoveryPage, { AccountRecoveryCancelPage } from "../account-recovery/AccountRecoveryPage";
import MiniAppPage from "../../features/miniapp/MiniAppPage";

// Вся админка — ОДНИМ lazy-модулем: AdminApp внутри статически импортирует все
// админ-страницы и их роуты, поэтому весь граф (включая DevExtreme и Highcharts)
// уезжает в отдельный chunk.admin автоматически — забыть «обернуть страницу
// в lazy» невозможно. Посетителю магазина чанк не выдаётся, браузер запросит его
// только при заходе в /admin. Это про скорость и вес публичного бандла, не про
// секретность: файл чанка остаётся публично доступным, защита — на сервере ([Authorize]).
const AdminApp = lazy(() => import(/* webpackChunkName: "admin" */ "../../pages/admin/AdminApp"));

// Старые ссылки /blog/<slug> (закладки, письма) ведут на тот же пост в разделе News.
function BlogSlugRedirect() {
    const { slug } = useParams<{ slug: string }>();
    return <Navigate to={slug ? `/news/${slug}` : "/news"} replace />;
}

export default function TaleGameshopMainWindow() {
    const location = useLocation();
    const isAdminRoute = location.pathname.startsWith("/admin");
    // Mini App (внутри Telegram) — своя витрина без сайтовой шапки/футера/чата.
    const isMiniAppRoute = location.pathname.startsWith("/tg");
    const isChromeless = isAdminRoute || isMiniAppRoute;
    // На главной распорку не рисуем — тёмный hero уходит под стеклянную шапку (свой отступ задаёт сам hero).
    const isHomeRoute = location.pathname === "/";

    // Scroll-reveal для всех .reveal на странице (см. styles/effects.css).
    const revealRootRef = useRef<HTMLDivElement | null>(null);
    useScrollReveal(revealRootRef, [location.pathname]);

    return (
        <AnalyticsProvider isAdminRoute={isAdminRoute}>
            <div ref={revealRootRef}>
                {!isChromeless && <TaleGameshopHeader></TaleGameshopHeader>}
                {!isChromeless && !isHomeRoute && <div className="main-page-down-header-padding"></div>}
                {/* Suspense ловит догрузку lazy-чанка админки; публичные страницы
                    импортированы статически и через фолбэк не проходят. */}
                <Suspense fallback={<div className="route-chunk-loading" aria-busy="true" />}>
                <Routes>
                    <Route path="/" element={<TaleGameshopMainPage/>}/>
                    <Route path="/games" element={<TaleGameshopGameList/>}/>
                    {/* Посадочная страница жанра: свой адрес, заголовок и описание,
                        чтобы каждая категория могла попасть в поиск отдельной страницей.
                        Три сегмента, поэтому с карточкой товара (/games/:slug) не спорит. */}
                    <Route path="/games/category/:categorySlug" element={<TaleGameshopGameList/>}/>
                    <Route path="/games/:slug" element={<GameDetailsPage/>}/>
                    <Route path="/deals" element={<DealsPage/>}/>
                    <Route path="/faq" element={<FaqPage/>}/>
                    <Route path="/newsletter/confirm" element={<NewsletterConfirmPage/>}/>
                    <Route path="/newsletter/unsubscribe" element={<NewsletterUnsubscribePage/>}/>
                    <Route path="/about" element={<AboutUs/>}/>
                    <Route path="/logIn" element={<LoginPage/>}/>
                    <Route path="/signUp" element={<RegistrationPage/>}/>
                    {/* Splat + вложенные <Routes> внутри AdminApp: конкретные
                        админ-маршруты живут рядом со страницами в одном модуле-чанке. */}
                    <Route
                        path="/admin/*"
                        element={
                            <PrivateRoute>
                                <AdminApp />
                            </PrivateRoute>
                        }
                    />
                    <Route path="/callback" element={<CallbackPage/>}/>
                    <Route path="/cart" element={<CartPage/>}/>
                    <Route path="/checkout" element={<CheckoutPage/>}/>
                    <Route path="/checkout/success" element={<SuccessPurchasePage/>}/>
                    <Route path="/delivery-confirmed" element={<DeliveryConfirmedPage/>}/>
                    <Route path="/checkout/cancel" element={<CancelPurchasePage/>}/>
                    <Route path="/successPurchasePage" element={<Navigate to="/checkout/success" replace />}/>
                    <Route path="/support" element={<SupportPage/>}/>
                    <Route path="/support/docs/:docId" element={<SupportDocPage/>}/>
                    <Route path="/account-recovery" element={<AccountRecoveryPage/>}/>
                    <Route path="/account-recovery/cancel" element={<AccountRecoveryCancelPage/>}/>
                    <Route path="/apologyPage" element={<ApologyPage/>}/>
                    {/* Блог живёт под именем «News» (/news); старые /blog-ссылки редиректят,
                        чтобы не умерли закладки и письма рассылки. */}
                    <Route path="/news" element={<BlogPage/>}/>
                    <Route path="/news/:slug" element={<BlogPostPage/>}/>
                    <Route path="/blog" element={<Navigate to="/news" replace/>}/>
                    <Route path="/blog/:slug" element={<BlogSlugRedirect/>}/>
                    <Route path="/tg" element={<MiniAppPage/>}/>
                    <Route
                        path="/account/*"
                        element={
                            <AuthorizedRoute>
                                <AccountRoutes />
                            </AuthorizedRoute>
                        }
                    />
                    <Route path="*" element={<NotFoundPage />} />
                </Routes>
                </Suspense>
                {!isChromeless && <TaleGameshopFooter></TaleGameshopFooter>}
                {!isChromeless && <ChatWidget />}
                {!isChromeless && <CookieBanner />}
            </div>
        </AnalyticsProvider>
    );
}
