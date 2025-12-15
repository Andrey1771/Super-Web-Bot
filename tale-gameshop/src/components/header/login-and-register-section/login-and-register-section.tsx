import React from "react";
import {useKeycloak} from "@react-keycloak/web";
import container from "../../../inversify.config";
import type {IKeycloakAuthService} from "../../../iterfaces/i-keycloak-auth-service";
import IDENTIFIERS from "../../../constants/identifiers";

interface LoginAndRegisterSectionProps {
    stacked?: boolean;
}

const LoginAndRegisterSection: React.FC<LoginAndRegisterSectionProps> = ({stacked = false}) => {
    const {keycloak} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);

    const login = async () => {
        if (!keycloak.authenticated) {
            await keycloakAuthService.loginWithRedirect(keycloak, window.location.href);
        }
    };

    const register = async () => {
        await keycloakAuthService.registerWithRedirect(keycloak, window.location.href);
    };


    return <div className={`auth-buttons ${stacked ? 'stacked' : ''}`}>
        <button
            className="btn btn-outline"
            onClick={login}
        >
            Login
        </button>
        <button
            className="btn btn-primary"
            onClick={register}
        >
            Sign Up
        </button>
    </div>
}

export default LoginAndRegisterSection;