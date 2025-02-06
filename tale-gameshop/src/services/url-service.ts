import {injectable} from "inversify";
import { IUrlService, KeycloakSettings } from "../iterfaces/i-url-service";

@injectable()
export class UrlService implements IUrlService {
    public get apiBaseUrl(): string {
        return "http://159.255.34.79";
    }

    public get keycloak(): KeycloakSettings {
        return {
            "url": "http://159.255.34.79/keycloak/",
            "realm": "TaleShop",
            "clientId": "tale-shop-app",
            "redirectUri": "http://159.255.34.79/callback",
            "silentCheckSsoRedirectUri": "http://159.255.34.79/silent-check-sso.html",
            "onLoad": "check-sso"
        } as KeycloakSettings;
    }
}