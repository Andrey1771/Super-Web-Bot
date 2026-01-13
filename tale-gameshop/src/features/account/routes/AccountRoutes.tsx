import React from "react";
import {Route, Routes} from "react-router-dom";
import AccountShell from "../components/AccountShell";
import AccountOverviewPage from "../pages/AccountOverviewPage";
import AccountPlaceholderPage from "../pages/AccountPlaceholderPage";

const AccountRoutes: React.FC = () => {
    return (
        <Routes>
            <Route
                index
                element={
                    <AccountShell
                        title="Account overview"
                        subtitle="Manage your purchases, keys, and account settings."
                        sectionLabel="Account overview"
                    >
                        <AccountOverviewPage/>
                    </AccountShell>
                }
            />
            <Route
                path="orders"
                element={
                    <AccountShell title="Orders" sectionLabel="Orders">
                        <AccountPlaceholderPage title="Orders"/>
                    </AccountShell>
                }
            />
            <Route
                path="keys"
                element={
                    <AccountShell title="Keys & activation" sectionLabel="Keys & activation">
                        <AccountPlaceholderPage title="Keys & activation"/>
                    </AccountShell>
                }
            />
            <Route
                path="saved"
                element={
                    <AccountShell title="Saved items" sectionLabel="Saved items">
                        <AccountPlaceholderPage title="Saved items"/>
                    </AccountShell>
                }
            />
            <Route
                path="settings"
                element={
                    <AccountShell title="Settings" sectionLabel="Settings">
                        <AccountPlaceholderPage title="Settings"/>
                    </AccountShell>
                }
            />
            <Route
                path="billing"
                element={
                    <AccountShell title="Billing" sectionLabel="Billing">
                        <AccountPlaceholderPage title="Billing"/>
                    </AccountShell>
                }
            />
            <Route
                path="security"
                element={
                    <AccountShell title="Security" sectionLabel="Security">
                        <AccountPlaceholderPage title="Security"/>
                    </AccountShell>
                }
            />
            <Route
                path="help"
                element={
                    <AccountShell title="Help" sectionLabel="Help">
                        <AccountPlaceholderPage title="Help"/>
                    </AccountShell>
                }
            />
        </Routes>
    );
};

export default AccountRoutes;
