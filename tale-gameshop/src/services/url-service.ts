import {injectable} from "inversify";
import { IUrlService, KeycloakSettings } from "../iterfaces/i-url-service";

@injectable()
export class UrlService implements IUrlService {
    public get apiBaseUrl(): string {
        return window.__APP_CONFIG__?.apiBaseUrl ?? "http://localhost:7002";
    }

    public get keycloak(): KeycloakSettings {
        return {
            "url": window.__APP_CONFIG__?.keycloak?.url ?? "http://localhost:8088/",
            "realm": window.__APP_CONFIG__?.keycloak?.realm ?? "TaleShop",
            "clientId": window.__APP_CONFIG__?.keycloak?.clientId ?? "tale-shop-app",
            "redirectUri": window.__APP_CONFIG__?.keycloak?.redirectUri ?? "http://localhost:3000/callback",
            "silentCheckSsoRedirectUri": window.__APP_CONFIG__?.keycloak?.silentCheckSsoRedirectUri ?? "http://localhost:3000/silent-check-sso.html",
            "onLoad": window.__APP_CONFIG__?.keycloak?.onLoad ?? "check-sso"
        } as KeycloakSettings;
    }
}

//prod TODO Вынести иначе
/*
 */
