import React, {useEffect} from "react";
import {Route, Routes} from "react-router-dom";
import {useKeycloak} from "@react-keycloak/web";
import AccountOverviewPage from "../pages/AccountOverviewPage";
import AccountPlaceholderPage from "../pages/AccountPlaceholderPage";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type {IKeycloakAuthService} from "../../../iterfaces/i-keycloak-auth-service";

export default function AccountRoutes() {
    const {keycloak} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);

    useEffect(() => {
        if (!keycloak.authenticated) {
            keycloakAuthService.loginWithRedirect(keycloak, window.location.href);
        }
    }, [keycloak, keycloakAuthService]);

    return (
        <Routes>
            <Route index element={<AccountOverviewPage/>}/>
            <Route path="orders" element={<AccountPlaceholderPage section="Orders"/>}/>
            <Route path="keys" element={<AccountPlaceholderPage section="Keys & activation"/>}/>
            <Route path="saved" element={<AccountPlaceholderPage section="Saved items"/>}/>
            <Route path="settings" element={<AccountPlaceholderPage section="Settings"/>}/>
            <Route path="billing" element={<AccountPlaceholderPage section="Billing"/>}/>
            <Route path="security" element={<AccountPlaceholderPage section="Security"/>}/>
            <Route path="help" element={<AccountPlaceholderPage section="Help"/>}/>
        </Routes>
    );
}
