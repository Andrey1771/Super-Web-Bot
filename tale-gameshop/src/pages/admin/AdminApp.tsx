import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "../../components/layout/AdminLayout";
import AdminPanelPage from "../../components/admin-panel/admin-panel-page/admin-panel-page";
import BotChangerPage from "../../components/admin-panel/bot-changer-page/bot-changer-page";
import SiteChangerPage from "../../components/admin-panel/site-changer-page/site-changer-page";
import CardAdderPage from "../../components/admin-panel/card-adder-page/card-adder-page";
import UserInfoPage from "../../components/admin-panel/user-info-page/user-info-page";
import UserStatsPage from "../../components/admin-panel/user-stats-page/user-stats-page";
import NewsletterPage from "./NewsletterPage";
import OrdersPage from "./OrdersPage";
import ProfilePage from "./ProfilePage";
import SettingsPage from "./SettingsPage";
import DataToolsPage from "./DataToolsPage";
import SteamImportPage from "./SteamImportPage";
import GameDetailsEditorPage from "./GameDetailsEditorPage";
import AdminGameKeysPage from "./AdminGameKeysPage";
import BlogPostsPage from "./blog/BlogPostsPage";
import BlogPostEditorPage from "./blog/BlogPostEditorPage";
import BlogCommentsPage from "./blog/BlogCommentsPage";
import AnalyticsOverviewPage from "./analytics/AnalyticsOverviewPage";
import AnalyticsSettingsPage from "./analytics/AnalyticsSettingsPage";
import SupportLiveChatPage from "./support/SupportLiveChatPage";
import SupportChatStatsPage from "./support/SupportChatStatsPage";
import SupportKnowledgePage from "./support/SupportKnowledgePage";
import SupportTicketsPage from "./SupportTicketsPage";
import PromoCodesPage from "./PromoCodesPage";
import CashbackPage from "./CashbackPage";
import PaymentIssuesPage from "./PaymentIssuesPage";
import RefundsPage from "./RefundsPage";
import CustomersPage from "./CustomersPage";
import CurrenciesPage from "./CurrenciesPage";
import PeriodReportPage from "./PeriodReportPage";
import InventoryValuePage from "./InventoryValuePage";
import AbandonedCartsPage from "./AbandonedCartsPage";
import ModerationPage from "./ModerationPage";
import PricesPage from "./PricesPage";
import AccountRecoveryAdminPage from "./AccountRecoveryAdminPage";
import GameDiscountsPage from "./GameDiscountsPage";
import AdminBotStatusPage from "./AdminBotStatusPage";
import AdminHealthPage from "./AdminHealthPage";

/**
 * Всё поддерево админки одним модулем.
 *
 * Снаружи (в главном окне) этот модуль подключён ЕДИНСТВЕННЫМ React.lazy — поэтому
 * весь его граф зависимостей, включая таблицы и Highcharts, уезжает в отдельный
 * chunk.admin и не выдаётся посетителям магазина. Внутри — обычные статические
 * импорты: новая админ-страница, добавленная сюда, попадает в чанк автоматически,
 * забыть «обернуть в lazy» невозможно.
 *
 * Пути относительные: снаружи мы смонтированы на /admin/*.
 */
export default function AdminApp() {
    return (
        <Routes>
            <Route element={<AdminLayout />}>
                <Route index element={<AdminPanelPage />} />
                <Route path="bot" element={<AdminBotStatusPage />} />
                <Route path="health" element={<AdminHealthPage />} />
                <Route path="botChanger" element={<BotChangerPage />} />
                <Route path="siteChanger" element={<SiteChangerPage />} />
                <Route path="cardAdder" element={<CardAdderPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="payments/issues" element={<PaymentIssuesPage />} />
                <Route path="payments/refunds" element={<RefundsPage />} />
                <Route path="payments/currencies" element={<CurrenciesPage />} />
                <Route path="reports/period" element={<PeriodReportPage />} />
                <Route path="reports/inventory" element={<InventoryValuePage />} />
                <Route path="reports/abandoned-carts" element={<AbandonedCartsPage />} />
                <Route path="promo-codes" element={<PromoCodesPage />} />
                <Route path="cashback" element={<CashbackPage />} />
                <Route path="game-discounts" element={<GameDiscountsPage />} />
                <Route path="games/prices" element={<PricesPage />} />
                <Route path="newsletter" element={<NewsletterPage />} />
                <Route path="blog" element={<BlogPostsPage />} />
                <Route path="blog/comments" element={<BlogCommentsPage />} />
                <Route path="blog/new" element={<BlogPostEditorPage />} />
                <Route path="blog/:id/edit" element={<BlogPostEditorPage />} />
                <Route path="blog/posts" element={<Navigate to="/admin/blog" replace />} />
                <Route path="blog/posts/new" element={<Navigate to="/admin/blog/new" replace />} />
                <Route path="blog/posts/:id/edit" element={<Navigate to="/admin/blog/:id/edit" replace />} />
                <Route path="analytics" element={<AnalyticsOverviewPage />} />
                <Route path="analytics/settings" element={<AnalyticsSettingsPage />} />
                <Route path="support/live-chat" element={<SupportLiveChatPage />} />
                <Route path="support/chat-stats" element={<SupportChatStatsPage />} />
                <Route path="support/knowledge" element={<SupportKnowledgePage />} />
                <Route path="support/tickets" element={<SupportTicketsPage />} />
                <Route path="support/recovery" element={<AccountRecoveryAdminPage />} />
                <Route path="support/moderation" element={<ModerationPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="data-tools" element={<DataToolsPage />} />
                <Route path="steam-import" element={<SteamImportPage />} />
                {/* Игра — в адресе, как у постов блога. Карточку можно дать ссылкой, открыть
                    в новой вкладке и вернуться «назад». Старый games/details?gameId= остаётся
                    рабочим: на него ведут закладки и ссылки из тостов. */}
                <Route path="games/:gameId/edit" element={<GameDetailsEditorPage />} />
                <Route path="games/details" element={<GameDetailsEditorPage />} />
                <Route path="games/keys" element={<AdminGameKeysPage />} />
                <Route path="userInfo" element={<UserInfoPage />} />
                <Route path="customers" element={<CustomersPage />} />
                <Route path="userStats" element={<UserStatsPage />} />
            </Route>
        </Routes>
    );
}
