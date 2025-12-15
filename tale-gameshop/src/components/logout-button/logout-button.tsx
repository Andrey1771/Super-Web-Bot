import React from 'react';
import {useKeycloak} from "@react-keycloak/web";
import {KeycloakInstance} from "keycloak-js";
import container from "../../inversify.config";
import type {IKeycloakAuthService} from "../../iterfaces/i-keycloak-auth-service";
import IDENTIFIERS from "../../constants/identifiers";
import {Link} from "react-router-dom";

interface LogOutButtonProps {
}

const LogOutButton: React.FC<LogOutButtonProps> = ({}) => {
    const {keycloak} = useKeycloak();

    const handleLogOut = async () => {
        await logout(keycloak);
    };

    return (
        <>
            <button className="hidden lg:inline-flex btn btn-outline" onClick={handleLogOut}>
                Sign Out
            </button>
            <button className="lg:hidden btn btn-ghost w-full justify-center" onClick={handleLogOut}>
                Sign Out
            </button>
            <div className="lg:hidden h-0"></div>
        </>
    );
}

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