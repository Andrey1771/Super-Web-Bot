import {IApiClient} from "../iterfaces/i-api-client";

const IDENTIFIERS = {
    IGameService: Symbol.for("IGameService"),
    ISettingsService: Symbol.for("ISettingsService"),
    IAuthStorageService: Symbol.for("IAuthStorageService"),
    IApiClient: Symbol.for("IApiClient"),
};

export default IDENTIFIERS;