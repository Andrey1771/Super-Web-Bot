import Keycloak, { KeycloakInstance } from 'keycloak-js';
import {IKeycloakAuthService} from "../iterfaces/i-keycloak-auth-service";

export class KeycloakService {

    public keycloak: KeycloakInstance = new (Keycloak as any)({
        url: "http://localhost:8087/",
        realm: "TaleShop",
        clientId: 'tale-shop-app'
    });

    public initOptions = {
        onLoad: 'check-sso',
        redirectUri: "http://localhost:3000/"
    }

    public async initialiseKeycloak() {
        try {
            console.log('Initializing keycloak service...');
            this.keycloak = new (Keycloak as any)({
                url: "http://localhost:8087/",
                realm: "TaleShop",
                clientId: 'tale-shop-app',
            });
            this.keycloak.redirectUri = 'http://localhost:3000/callback';

            const authenticated = await this.keycloak.init({
                onLoad: 'check-sso',
            });
            if (authenticated) {
                console.log('User is authenticated');
            } else {
                console.log('User is not authenticated');
            }
        } catch (error) {
            console.error('Failed to initialize adapter:', error);
        }
    }
}