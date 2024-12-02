import {injectable} from "inversify";
import {IKeycloakAuthService} from "../iterfaces/i-keycloak-auth-service";
import {KeycloakInstance} from "keycloak-js";

@injectable()
export class KeycloakAuthService implements IKeycloakAuthService {
    async loginWithRedirect(keycloak: KeycloakInstance): Promise<void> {
        try {
            await keycloak.login({
                redirectUri: 'http://localhost:3000/callback', // Укажите URL для редиректа после логина
            });
        } catch (error) {
            console.error('Ошибка при логине:', error);
        }
    }

    async logoutWithRedirect(keycloak: KeycloakInstance): Promise<void> {
        try {
            await keycloak.logout({
                redirectUri: 'http://localhost:3000',
            });
        } catch (error) {
            console.error('Ошибка при логине:', error);
        }
    }

    async registerWithRedirect(keycloak: KeycloakInstance): Promise<void> {
        try {
            await keycloak.register({
                redirectUri: 'http://localhost:3000/callback',
            });
        } catch (error) {
            console.error('Ошибка при логине:', error);
        }
    }
}