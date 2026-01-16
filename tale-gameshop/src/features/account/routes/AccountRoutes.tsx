import React from 'react';
import {Navigate, Route, Routes} from 'react-router-dom';
import AccountOverviewPage from '../pages/AccountOverviewPage';
import AccountOrdersPage from '../pages/AccountOrdersPage';
import AccountKeysPage from '../pages/AccountKeysPage';
import AccountSettingsPage from '../pages/AccountSettingsPage';
import AccountBillingPage from '../pages/AccountBillingPage';
import AccountSavedItemsPage from '../pages/AccountSavedItemsPage';
import AccountSecurityPage from '../pages/AccountSecurityPage';
import AccountHelpPage from '../pages/AccountHelpPage';

const AccountRoutes: React.FC = () => {
    return (
        <Routes>
            <Route index element={<AccountOverviewPage />} />
            <Route path="orders" element={<AccountOrdersPage />} />
            <Route path="keys" element={<AccountKeysPage />} />
            <Route path="saved" element={<AccountSavedItemsPage />} />
            <Route path="settings" element={<AccountSettingsPage />} />
            <Route path="billing" element={<AccountBillingPage />} />
            <Route path="security" element={<AccountSecurityPage />} />
            <Route path="help" element={<AccountHelpPage />} />
            <Route path="*" element={<Navigate to="/account" replace />} />
        </Routes>
    );
};

export default AccountRoutes;
