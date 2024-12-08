import Keycloak, { KeycloakInstance } from 'keycloak-js';
import {IKeycloakAuthService} from "../iterfaces/i-keycloak-auth-service";
import { IKeycloakService } from '../iterfaces/i-keycloak-service';
import {injectable} from "inversify";
import {AuthClientInitOptions} from "@react-keycloak/core/lib/types";

@injectable()
export class KeycloakService implements IKeycloakService {

    public _keycloak: KeycloakInstance = new (Keycloak as any)({
        url: "http://localhost:8088/",
        realm: "TaleShop",
        clientId: 'tale-shop-app'
    });

    get keycloak(): KeycloakInstance {
        return this._keycloak;
    }

    private _initOptions = {
        onLoad: 'check-sso',
        redirectUri: "http://localhost:3000",
        silentCheckSsoRedirectUri: "http://localhost:3000/callback"
    }

    get initOptions(): AuthClientInitOptions {
        return this._initOptions;
    }

    public async initialiseKeycloak() {
        try {
            console.log('Initializing keycloak service...');
            this._keycloak = new (Keycloak as any)({
                url: "http://localhost:8088/",
                realm: "TaleShop",
                clientId: 'tale-shop-app',
            });
            this._keycloak.redirectUri = 'http://localhost:3000/callback';

            const authenticated = await this._keycloak.init({
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