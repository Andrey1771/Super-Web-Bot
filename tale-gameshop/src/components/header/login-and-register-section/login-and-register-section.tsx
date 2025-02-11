import React from "react";
import {useKeycloak} from "@react-keycloak/web";
import container from "../../../inversify.config";
import type {IKeycloakAuthService} from "../../../iterfaces/i-keycloak-auth-service";
import IDENTIFIERS from "../../../constants/identifiers";

const LoginAndRegisterSection: React.FC = ({}) => {
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


    return <>
        <button
            className="hidden lg:flex px-4 py-2 border border-gray-700 text-gray-700 animated-button cursor-pointer"
            onClick={login}
        >
            Login
        </button>
        <div
            className="lg:hidden text-gray-700 menu-item cursor-pointer"
            onClick={login}>
            Login
        </div>

        <button
            className="hidden lg:flex px-4 py-2 bg-black text-white animated-button cursor-pointer"
            onClick={register}
        >
            Sign Up
        </button>
        <div
            className="lg:hidden text-gray-700 menu-item cursor-pointer"
            onClick={register}>
            Sign Up
        </div>
        <div className="lg:hidden h-0"></div>
    </>
}

export default LoginAndRegisterSection;