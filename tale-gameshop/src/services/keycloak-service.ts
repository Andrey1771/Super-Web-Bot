import Keycloak, {KeycloakInstance} from 'keycloak-js';
import {IKeycloakService} from '../iterfaces/i-keycloak-service';
import {injectable} from "inversify";
import {AuthClientEvent, AuthClientInitOptions} from "@react-keycloak/core/lib/types";
import EventEmitter from 'eventemitter3';

import webSettings from '../webSettings.json';

@injectable()
export class KeycloakService implements IKeycloakService {
    public _keycloak: KeycloakInstance = new (Keycloak as any)({
        url: webSettings.keycloak.url,
        realm: webSettings.keycloak.realm,
        clientId: webSettings.keycloak.clientId
    });

    get keycloak(): KeycloakInstance {
        return this._keycloak;
    }

    private _stateChangedEmitter = new EventEmitter();
    get stateChangedEmitter() {
        return this._stateChangedEmitter
    };

    private _initOptions = {
        onLoad: webSettings.keycloak.onLoad,
        redirectUri: webSettings.keycloak.redirectUri,
        silentCheckSsoRedirectUri: webSettings.keycloak.silentCheckSsoRedirectUri
    }

    get initOptions(): AuthClientInitOptions {
        return this._initOptions;
    }

    eventHandlers(e: AuthClientEvent): void {
        switch (e) {
            case "onReady":
                break;
            case "onInitError":
                break;
            case "onAuthSuccess":
                this.stateChangedEmitter.emit('onAuthSuccess');
                break;
            case "onAuthError":
                break;
            case "onAuthRefreshSuccess":
                break;
            case "onAuthRefreshError":
                break;
            case "onAuthLogout":
                break;
            case "onTokenExpired":
                break;
        }
    }

    public async initialiseKeycloak() {
        try {
            console.log('Initializing keycloak service...');
            this._keycloak = new (Keycloak as any)({
                url: webSettings.keycloak.url,
                realm: webSettings.keycloak.realm,
                clientId: webSettings.keycloak.clientId
            });
            this._keycloak.redirectUri = webSettings.keycloak.redirectUri;

            const authenticated = await this._keycloak.init({
                onLoad: webSettings.keycloak.onLoad
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