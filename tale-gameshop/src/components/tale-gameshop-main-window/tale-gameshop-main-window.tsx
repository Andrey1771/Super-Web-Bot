import React, { Suspense, lazy } from "react";
import TaleGameshopHeader from "../header/tale-gameshop-header/tale-gameshop-header";
import TaleGameshopFooter from "../tale-gameshop-footer/tale-gameshop-footer";
import TaleGameshopMainPage from "../tale-gameshop-main-page/tale-gameshop-main-page";
import './tale-gameshop-main-window.css'
import {Navigate, Route, Routes, useLocation, useParams} from "react-router-dom";
import TaleGameshopGameList from "../game-list-page/game-list-page";
import { SoftwareCatalogRedirect, SoftwareProductRedirect, StoreCatalog } from "../utils/software-redirects";
import LoginPage from "../login-page/login-page";
import RegistrationPage from "../registration-page/registration-page";
import ChatWidget from "../support-chat/ChatWidget";
import LanguageScope from "../common/LanguageScope";
import CallbackPage from "../callback-page/callback-page";
import PrivateRoute from "../utils/private-route/private-route";
import AuthorizedRoute from "../utils/authorized-route/authorized-route";
import NotFoundPage from "../utils/not-found-page/not-found-page";
import NewsletterConfirmPage from "../newsletter/NewsletterConfirmPage";
import NewsletterUnsubscribePage from "../newsletter/NewsletterUnsubscribePage";
import ReviewInviteUnsubscribePage from "../newsletter/ReviewInviteUnsubscribePage";
import CashbackNoticeUnsubscribePage from "../newsletter/CashbackNoticeUnsubscribePage";
import GameDetailsPage from "../../pages/game-details-page/GameDetailsPage";
import AnalyticsProvider from "../analytics/AnalyticsProvider";
import { captureAttribution } from "../../utils/attribution";
import CookieBanner from "../analytics/CookieBanner";
import AccountRecoveryPage, { AccountRecoveryCancelPage } from "../account-recovery/AccountRecoveryPage";

// Вся админка — ОДНИМ lazy-модулем: AdminApp внутри статически импортирует все
// админ-страницы и их роуты, поэтому весь граф (включая DevExtreme и Highcharts)
// уезжает в отдельный chunk.admin автоматически — забыть «обернуть страницу
// в lazy» невозможно. Посетителю магазина чанк не выдаётся, браузер запросит его
// только при заходе в /admin. Это про скорость и вес публичного бандла, не про
// секретность: файл чанка остаётся публично доступным, защита — на сервере ([Authorize]).
const AdminApp = lazy(() => import(/* webpackChunkName: "admin" */ "../../pages/admin/AdminApp"));

// Остальные разделы — тоже отдельными чанками, сгруппированными по смыслу: корзина с
// оплатой, поддержка, новости, кабинет. Публичный бандл был одним куском в 1.29 МБ, и
// посетитель, пришедший за одной игрой, качал вместе с ней Stripe Elements, редактор
// профиля и разметку справки.
//
// Намеренно НЕ разрезаны главная и карточка игры: на них человек попадает первым, из
// поиска или по ссылке, и лишний round-trip за чанком там дороже сэкономленных килобайт.
// Догрузку ловит тот же <Suspense> ниже, что и админку.
const AboutUs = lazy(() => import(/* webpackChunkName: "about" */ "../about-us/about-us"));
// Своим чанком: страница правил кэшбэка нужна редко, а тянет за собой таблицу уровней и FAQ.
const RewardsPage = lazy(() => import(/* webpackChunkName: "rewards" */ "../rewards-page/rewards-page"));
const CartPage = lazy(() => import(/* webpackChunkName: "cart" */ "../cart/cart-page/cart-page").then(m => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import(/* webpackChunkName: "checkout" */ "../cart/checkout-page/checkout-page"));
const SuccessPurchasePage = lazy(() => import(/* webpackChunkName: "checkout" */ "../cart/success-purchase-page/success-purchase-page"));
const DeliveryConfirmedPage = lazy(() => import(/* webpackChunkName: "checkout" */ "../cart/delivery-confirmed-page/delivery-confirmed-page"));
const CancelPurchasePage = lazy(() => import(/* webpackChunkName: "checkout" */ "../cart/cancel-purchase-page"));
const SupportPage = lazy(() => import(/* webpackChunkName: "support" */ "../support-page/support-page"));
const SupportDocPage = lazy(() => import(/* webpackChunkName: "support" */ "../support-docs/support-doc-page"));
const FaqPage = lazy(() => import(/* webpackChunkName: "support" */ "../faq-page/faq-page"));
const BlogPage = lazy(() => import(/* webpackChunkName: "blog" */ "../blog-page/blog-page"));
const BlogPostPage = lazy(() => import(/* webpackChunkName: "blog" */ "../blog-page/blog-post-page"));
const DealsPage = lazy(() => import(/* webpackChunkName: "deals" */ "../deals-page/deals-page"));
const AccountRoutes = lazy(() => import(/* webpackChunkName: "account" */ "../../features/account/routes/AccountRoutes"));
const MiniAppPage = lazy(() => import(/* webpackChunkName: "miniapp" */ "../../features/miniapp/MiniAppPage"));

// Старые ссылки /blog/<slug> (закладки, письма) ведут на тот же пост в разделе News.
// Первое касание снимается один раз при загрузке модуля, до рендера: если человек
// закроет вкладку сразу, источник всё равно уже записан.
captureAttribution();

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

    return (
        <AnalyticsProvider isAdminRoute={isAdminRoute}>
            <div>
                {!isChromeless && <TaleGameshopHeader></TaleGameshopHeader>}
                {!isChromeless && !isHomeRoute && <div className="main-page-down-header-padding"></div>}
                {/* Suspense ловит догрузку lazy-чанка админки; публичные страницы
                    импортированы статически и через фолбэк не проходят. */}
                <Suspense fallback={<div className="route-chunk-loading" aria-busy="true" />}>
                {/* Страницы берут тексты с сервера на языке сайта: смена языка перемонтирует их,
                    чтобы ни одна не осталась с данными на прежнем языке. */}
                <LanguageScope>
                <Routes>
                    <Route path="/" element={<TaleGameshopMainPage/>}/>
                    {/* Один каталог: игры, а софт — режим того же каталога (?type=software) со своими фильтрами. */}
                    <Route path="/games" element={<StoreCatalog/>}/>
                    {/* Старый раздел /software — только редиректы, чтобы не ломать закладки и индекс. */}
                    <Route path="/software" element={<SoftwareCatalogRedirect/>}/>
                    <Route path="/software/category/:categorySlug" element={<SoftwareCatalogRedirect/>}/>
                    <Route path="/software/:slug" element={<SoftwareProductRedirect/>}/>
                    {/* Посадочная страница жанра: свой адрес, заголовок и описание,
                        чтобы каждая категория могла попасть в поиск отдельной страницей.
                        Три сегмента, поэтому с карточкой товара (/games/:slug) не спорит. */}
                    <Route path="/games/category/:categorySlug" element={<TaleGameshopGameList key="games"/>}/>
                    <Route path="/games/:slug" element={<GameDetailsPage/>}/>
                    <Route path="/deals" element={<DealsPage/>}/>
                    <Route path="/faq" element={<FaqPage/>}/>
                    <Route path="/newsletter/confirm" element={<NewsletterConfirmPage/>}/>
                    <Route path="/newsletter/unsubscribe" element={<NewsletterUnsubscribePage/>}/>
                    {/* Отказ от писем «расскажите, как вам игра». Отдельно от рассылки: разные вещи. */}
                    <Route path="/reviews/unsubscribe" element={<ReviewInviteUnsubscribePage/>}/>
                    <Route path="/cashback/unsubscribe" element={<CashbackNoticeUnsubscribePage/>}/>
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
                    {/* Кэшбэк открыт всем: на эту страницу ведёт карточка в герое главной,
                        и понять предложение человек должен до регистрации. Личный баланс
                        живёт отдельно, в кабинете. */}
                    <Route path="/rewards" element={<RewardsPage/>}/>
                    <Route path="/support" element={<SupportPage/>}/>
                    <Route path="/support/docs/:docId" element={<SupportDocPage/>}/>
                    <Route path="/account-recovery" element={<AccountRecoveryPage/>}/>
                    <Route path="/account-recovery/cancel" element={<AccountRecoveryCancelPage/>}/>
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
                </LanguageScope>
                </Suspense>
                {!isChromeless && <TaleGameshopFooter></TaleGameshopFooter>}
                {!isChromeless && <ChatWidget />}
                {!isChromeless && <CookieBanner />}
            </div>
        </AnalyticsProvider>
    );
}
