import React from 'react';
import {useKeycloak} from "@react-keycloak/web";
import {KeycloakInstance} from "keycloak-js";
import container from "../../inversify.config";
import type {IKeycloakAuthService} from "../../iterfaces/i-keycloak-auth-service";
import IDENTIFIERS from "../../constants/identifiers";

const LogOutButton: React.FC = () => {
    const { keycloak } = useKeycloak();

    const handleLogOut = async () => {
        await logout(keycloak);
    };

    return <button className="px-4 py-2 bg-black text-white animated-button" onClick={handleLogOut}>Sign Out</button>;
};

const logout = async (keycloak: KeycloakInstance) => {
    try {
        const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);

        await keycloakAuthService.logoutWithRedirect(keycloak, window.location.href);
        console.log('Logout successful');
    } catch (error) {
        console.error('Error logout:', error);
    }
}

export default LogOutButton;