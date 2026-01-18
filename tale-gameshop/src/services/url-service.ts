import {injectable} from "inversify";
import { IUrlService, KeycloakSettings } from "../iterfaces/i-url-service";

@injectable()
export class UrlService implements IUrlService {
    public get apiBaseUrl(): string {
        return window.__APP_CONFIG__?.apiBaseUrl ?? "https://localhost:7002";
    }

    public get keycloak(): KeycloakSettings {
        const origin = window.location.origin;
        return {
            "url": window.__APP_CONFIG__?.keycloak?.url ?? "http://localhost:8088/",
            "realm": window.__APP_CONFIG__?.keycloak?.realm ?? "TaleShop",
            "clientId": window.__APP_CONFIG__?.keycloak?.clientId ?? "tale-shop-app",
            "redirectUri": window.__APP_CONFIG__?.keycloak?.redirectUri ?? origin,
            "silentCheckSsoRedirectUri": window.__APP_CONFIG__?.keycloak?.silentCheckSsoRedirectUri ?? `${origin}/silent-check-sso.html`,
            "onLoad": window.__APP_CONFIG__?.keycloak?.onLoad ?? "check-sso"
        } as KeycloakSettings;
    }
}

//prod TODO Вынести иначе
/*
 */
