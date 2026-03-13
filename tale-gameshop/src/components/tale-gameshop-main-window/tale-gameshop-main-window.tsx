import React, { useEffect } from "react";
import TaleGameshopHeader from "../header/tale-gameshop-header/tale-gameshop-header";
import TaleGameshopFooter from "../tale-gameshop-footer/tale-gameshop-footer";
import TaleGameshopMainPage from "../tale-gameshop-main-page/tale-gameshop-main-page";
import './tale-gameshop-main-window.css'
import {Navigate, Route, Routes, useLocation} from "react-router-dom";
import TaleGameshopGameList from "../game-list-page/game-list-page";
import AboutUs from "../about-us/about-us";
import LoginPage from "../login-page/login-page";
import RegistrationPage from "../registration-page/registration-page";
import ChatWidget from "../support-chat/ChatWidget";
import AdminPanelPage from "../admin-panel/admin-panel-page/admin-panel-page";
import CallbackPage from "../callback-page/callback-page";
import PrivateRoute from "../utils/private-route/private-route";
import BotChangerPage from "../admin-panel/bot-changer-page/bot-changer-page";
import SiteChangerPage from "../admin-panel/site-changer-page/site-changer-page";
import CardAdderPage from "../admin-panel/card-adder-page/card-adder-page";
import {CartPage} from "../cart/cart-page/cart-page";
import CheckoutPage from "../cart/checkout-page/checkout-page";
import SuccessPurchasePage from "../cart/success-purchase-page/success-purchase-page";
import CancelPurchasePage from "../cart/cancel-purchase-page";
import ApologyPage from "../apology-page/apology-page";
import SupportPage from "../support-page/support-page";
import SupportDocPage from "../support-docs/support-doc-page";
import UserInfoPage from "../admin-panel/user-info-page/user-info-page";
import UserStatsPage from "../admin-panel/user-stats-page/user-stats-page";
import BlogPage from "../blog-page/blog-page";
import BlogPostPage from "../blog-page/blog-post-page";
import GameDetailsPage from "../../pages/game-details-page/GameDetailsPage";
import AccountRoutes from "../../features/account/routes/AccountRoutes";
import AdminLayout from "../layout/AdminLayout";
import OrdersPage from "../../pages/admin/OrdersPage";
import ProfilePage from "../../pages/admin/ProfilePage";
import SettingsPage from "../../pages/admin/SettingsPage";
import DataToolsPage from "../../pages/admin/DataToolsPage";
import GameDetailsEditorPage from "../../pages/admin/GameDetailsEditorPage";
import BlogPostsPage from "../../pages/admin/blog/BlogPostsPage";
import BlogPostEditorPage from "../../pages/admin/blog/BlogPostEditorPage";
import AnalyticsOverviewPage from "../../pages/admin/analytics/AnalyticsOverviewPage";
import AnalyticsSettingsPage from "../../pages/admin/analytics/AnalyticsSettingsPage";
import AnalyticsProvider from "../analytics/AnalyticsProvider";
import CookieBanner from "../analytics/CookieBanner";
import { analyticsClient } from "../../utils/analytics-client";
import SupportLiveChatPage from "../../pages/admin/support/SupportLiveChatPage";
import PromoCodesPage from "../../pages/admin/PromoCodesPage";
import PaymentIssuesPage from "../../pages/admin/PaymentIssuesPage";

export default function TaleGameshopMainWindow() {
    const location = useLocation();
    const isAdminRoute = location.pathname.startsWith("/admin");

    useEffect(() => {
        analyticsClient.trackPageView(location.pathname + location.search, document.title);
    }, [location.pathname, location.search]);

    return (
        <div>
            {!isAdminRoute && <TaleGameshopHeader></TaleGameshopHeader>}
            {!isAdminRoute && <div className="main-page-down-header-padding"></div>}
                {!isAdminRoute && <AnalyticsProvider />}
                <Routes>
                    <Route path="/" element={<TaleGameshopMainPage/>}/>
                    <Route path="/games" element={<TaleGameshopGameList/>}/>
                    <Route path="/games/:slug" element={<GameDetailsPage/>}/>
                    <Route path="/about" element={<AboutUs/>}/>
                    <Route path="/logIn" element={<LoginPage/>}/>
                    <Route path="/signUp" element={<RegistrationPage/>}/>
                    <Route
                        path="/admin"
                        element={
                            <PrivateRoute>
                                <AdminLayout />
                            </PrivateRoute>
                        }
                    >
                        <Route index element={<AdminPanelPage />} />
                        <Route path="botChanger" element={<BotChangerPage />} />
                        <Route path="siteChanger" element={<SiteChangerPage />} />
                        <Route path="cardAdder" element={<CardAdderPage />} />
                        <Route path="orders" element={<OrdersPage />} />
                        <Route path="payments/issues" element={<PaymentIssuesPage />} />
                        <Route path="promo-codes" element={<PromoCodesPage />} />
                        <Route path="blog" element={<BlogPostsPage />} />
                        <Route path="blog/new" element={<BlogPostEditorPage />} />
                        <Route path="blog/:id/edit" element={<BlogPostEditorPage />} />
                        <Route path="blog/posts" element={<Navigate to="/admin/blog" replace />} />
                        <Route path="blog/posts/new" element={<Navigate to="/admin/blog/new" replace />} />
                        <Route path="blog/posts/:id/edit" element={<Navigate to="/admin/blog/:id/edit" replace />} />
                        <Route path="analytics" element={<AnalyticsOverviewPage />} />
                        <Route path="analytics/settings" element={<AnalyticsSettingsPage />} />
                        <Route path="support/live-chat" element={<SupportLiveChatPage />} />
                        <Route path="profile" element={<ProfilePage />} />
                        <Route path="settings" element={<SettingsPage />} />
                        <Route path="data-tools" element={<DataToolsPage />} />
                        <Route path="games/details" element={<GameDetailsEditorPage />} />
                        <Route path="userInfo" element={<UserInfoPage />} />
                        <Route path="userStats" element={<UserStatsPage />} />
                    </Route>
                    <Route path="/callback" element={<CallbackPage/>}/>
                    <Route path="/cart" element={<CartPage/>}/>
                    <Route path="/checkout" element={<CheckoutPage/>}/>
                    <Route path="/checkout/success" element={<SuccessPurchasePage/>}/>
                    <Route path="/checkout/cancel" element={<CancelPurchasePage/>}/>
                    <Route path="/successPurchasePage" element={<Navigate to="/checkout/success" replace />}/>
                    <Route path="/support" element={<SupportPage/>}/>
                    <Route path="/support/docs/:docId" element={<SupportDocPage/>}/>
                    <Route path="/apologyPage" element={<ApologyPage/>}/>
                    <Route path="/blog" element={<BlogPage/>}/>
                    <Route path="/blog/:slug" element={<BlogPostPage/>}/>
                    <Route
                        path="/account/*"
                        element={
                            <PrivateRoute>
                                <AccountRoutes />
                            </PrivateRoute>
                        }
                    />
                </Routes>
            {!isAdminRoute && <TaleGameshopFooter></TaleGameshopFooter>}
            {!isAdminRoute && <ChatWidget />}
            {!isAdminRoute && <CookieBanner />}
        </div>
    );
}
