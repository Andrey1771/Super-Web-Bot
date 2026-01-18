import Keycloak, {KeycloakInstance} from 'keycloak-js';
import {IKeycloakService} from '../iterfaces/i-keycloak-service';
import {injectable} from "inversify";
import {AuthClientEvent, AuthClientInitOptions} from "@react-keycloak/core/lib/types";
import EventEmitter from 'eventemitter3';

import {IUrlService} from "../iterfaces/i-url-service";
import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";


@injectable()
export class KeycloakService implements IKeycloakService {
    private readonly _urlService: IUrlService;

    constructor() {
        //TODO Почему-то не resolve по нормальному, Проблема в том, что действие в сервисе, а не в компоненте?
        this._urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
    }


    public _keycloak: KeycloakInstance = new (Keycloak as any)({
        url: container.get<IUrlService>(IDENTIFIERS.IUrlService).keycloak.url,// TODO вынести в конструктор
        realm: container.get<IUrlService>(IDENTIFIERS.IUrlService).keycloak.realm,
        clientId: container.get<IUrlService>(IDENTIFIERS.IUrlService).keycloak.clientId
    });

    get keycloak(): KeycloakInstance {
        return this._keycloak;
    }

    private _stateChangedEmitter = new EventEmitter();
    get stateChangedEmitter() {
        return this._stateChangedEmitter
    };

    private _initOptions = {
        onLoad: container.get<IUrlService>(IDENTIFIERS.IUrlService).keycloak.onLoad,// TODO вынести в конструктор
        redirectUri: container.get<IUrlService>(IDENTIFIERS.IUrlService).keycloak.redirectUri,
        silentCheckSsoRedirectUri: container.get<IUrlService>(IDENTIFIERS.IUrlService).keycloak.silentCheckSsoRedirectUri
    }

    get initOptions(): AuthClientInitOptions {
        return this._initOptions;
    }

    eventHandlers(e: AuthClientEvent): void {
        switch (e) {
            case "onReady":
                if (this._keycloak?.authenticated) {
                    this.stateChangedEmitter.emit('onAuthSuccess');
                }
                break;
            case "onInitError":
                break;
            case "onAuthSuccess":
                this.stateChangedEmitter.emit('onAuthSuccess');
                break;
            case "onAuthError":
                break;
            case "onAuthRefreshSuccess":
                this.stateChangedEmitter.emit('onAuthSuccess');
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
                url: this._urlService.keycloak.url,
                realm: this._urlService.keycloak.realm,
                clientId: this._urlService.keycloak.clientId
            });
            this._keycloak.redirectUri = this._urlService.keycloak.redirectUri;

            const authenticated = await this._keycloak.init({
                onLoad: this._urlService.keycloak.onLoad
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
