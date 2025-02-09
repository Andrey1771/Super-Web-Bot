import {injectable} from "inversify";
import { IUrlService, KeycloakSettings } from "../iterfaces/i-url-service";

@injectable()
export class UrlService implements IUrlService {
    public get apiBaseUrl(): string {
        return "https://kimyashka.ru/";
    }

    public get keycloak(): KeycloakSettings {
        return {
            "url": "https://kimyashka.ru/keycloak/",
            "realm": "TaleShop",
            "clientId": "tale-shop-app",
            "redirectUri": "https://kimyashka.ru/callback",
            "silentCheckSsoRedirectUri": "https://kimyashka.ru/silent-check-sso.html",
            "onLoad": "check-sso"
        } as KeycloakSettings;
    }
}