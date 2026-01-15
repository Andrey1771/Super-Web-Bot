import React from 'react';
import {Navigate, Route, Routes} from 'react-router-dom';
import AccountOverviewPage from '../pages/AccountOverviewPage';
import AccountOrdersPage from '../pages/AccountOrdersPage';
import AccountBillingPage from '../pages/AccountBillingPage';
import AccountSettingsPage from '../pages/AccountSettingsPage';
import AccountSavedPage from '../pages/AccountSavedPage';
import AccountPlaceholderPage from '../pages/AccountPlaceholderPage';

const AccountRoutes: React.FC = () => {
    return (
        <Routes>
            <Route index element={<AccountOverviewPage />} />
            <Route path="orders" element={<AccountOrdersPage />} />
            <Route path="keys" element={<AccountPlaceholderPage title="Keys & activation" />} />
            <Route path="saved" element={<AccountSavedPage />} />
            <Route path="settings" element={<AccountSettingsPage />} />
            <Route path="billing" element={<AccountBillingPage />} />
            <Route path="security" element={<AccountPlaceholderPage title="Security" />} />
            <Route path="help" element={<AccountPlaceholderPage title="Help" />} />
            <Route path="*" element={<Navigate to="/account" replace />} />
        </Routes>
    );
};

export default AccountRoutes;
