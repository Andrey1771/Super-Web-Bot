import {injectable} from "inversify";
import {IKeycloakAuthService} from "../iterfaces/i-keycloak-auth-service";
import {KeycloakInstance} from "keycloak-js";

@injectable()
export class KeycloakAuthService implements IKeycloakAuthService {
    async loginWithRedirect(keycloak: KeycloakInstance, uri: string): Promise<void> {
        try {
            await keycloak.login({
                redirectUri: uri, // Укажите URL для редиректа после логина
            });
        } catch (error) {
            console.error('Ошибка при логине:', error);
        }
    }

    async logoutWithRedirect(keycloak: KeycloakInstance, uri: string): Promise<void> {
        try {
            await keycloak.logout({
                redirectUri: uri,
            });
        } catch (error) {
            console.error('Ошибка при логине:', error);
        }
    }

    async registerWithRedirect(keycloak: KeycloakInstance, uri: string): Promise<void> {
        try {
            await keycloak.register({
                redirectUri: uri,
            });
        } catch (error) {
            console.error('Ошибка при логине:', error);
        }
    }
}