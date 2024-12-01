import "reflect-metadata";
import { Container } from "inversify";
import {IGameService} from "./iterfaces/i-game-service";
import IDENTIFIERS from "./constants/identifiers";
import { GameService } from "./services/game-service";
import {ISettingsService} from "./iterfaces/i-settings-service";
import { SettingsService } from "./services/settings-service";
import {IAuthStorageService} from "./iterfaces/i-auth-storage-service";
import {CookiesStorageService} from "./services/cookies-storage-service";
import {ApiClient} from "./services/api-client";
import {IApiClient} from "./iterfaces/i-api-client";
import {IKeycloakAuthService} from "./iterfaces/i-keycloak-auth-service";
import {KeycloakAuthService} from "./services/keycloak-auth-service";

const container = new Container();

container.bind<IGameService>(IDENTIFIERS.IGameService).to(GameService);
container.bind<ISettingsService>(IDENTIFIERS.ISettingsService).to(SettingsService);
container.bind<IAuthStorageService>(IDENTIFIERS.IAuthStorageService).to(CookiesStorageService);

container.bind<IApiClient>(IDENTIFIERS.IApiClient).to(ApiClient);

container.bind<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService).to(KeycloakAuthService).inSingletonScope();


export default container;