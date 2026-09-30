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
    private _sessionExpiredNotified = false;

    markSessionExpired(): void {
        if (this._sessionExpiredNotified) {
            return;
        }
        this._sessionExpiredNotified = true;
        // clearToken снимает authenticated и через провайдер даёт onAuthLogout: шапка сразу показывает
        // вход, аналитика забывает пользователя. Плашка объясняет, почему.
        if (this._keycloak?.authenticated) {
            this._keycloak.clearToken();
        }
        this._stateChangedEmitter.emit('onSessionExpired');
    }
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
                // Глушить это событие нельзя. При ошибке init провайдер @react-keycloak
                // НЕ выставляет initialized (см. provider.js: .init(...).catch(onError),
                // а initialized: true ставится только в updateState), поэтому приложение
                // навсегда остаётся на LoadingComponent — бесконечная заставка без единого
                // слова в консоли. Пробрасываем наружу, чтобы лоадер показал ошибку.
                this.stateChangedEmitter.emit('onInitError');
                break;
            case "onAuthSuccess":
                this._sessionExpiredNotified = false;
                this.stateChangedEmitter.emit('onAuthSuccess');
                break;
            case "onAuthError":
                break;
            case "onAuthRefreshSuccess":
                this._sessionExpiredNotified = false;
                this.stateChangedEmitter.emit('onAuthSuccess');
                break;
            case "onAuthRefreshError":
                // Провайдер не смог обновить токен: сессия Keycloak закончилась (30 минут без действий).
                // Раньше событие глушилось, и сайт молчал с «Account» в шапке и 401 на каждый запрос.
                this.markSessionExpired();
                break;
            case "onAuthLogout":
                // Выход нужен наружу: аналитика обязана забыть, кто это был, иначе следующий
                // гость на том же компьютере продолжит считаться предыдущим покупателем.
                this.stateChangedEmitter.emit('onAuthLogout');
                break;
            case "onTokenExpired":
                // Сюда провайдер @react-keycloak приходит только с autoRefreshToken=false; по умолчанию он сам
                // зовёт updateToken(5) по истечении токена, и это событие наружу не отдаёт.
                break;
        }
    }

    public async initialiseKeycloak() {
        try {
            this._keycloak = new (Keycloak as any)({
                url: this._urlService.keycloak.url,
                realm: this._urlService.keycloak.realm,
                clientId: this._urlService.keycloak.clientId
            });
            this._keycloak.redirectUri = this._urlService.keycloak.redirectUri;

            await this._keycloak.init({
                onLoad: this._urlService.keycloak.onLoad
            });
        } catch (error) {
            console.error('Failed to initialize adapter:', error);
        }
    }
}
