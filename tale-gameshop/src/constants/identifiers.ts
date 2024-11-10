import {ISettingsService} from "../iterfaces/i-settings-service";

const IDENTIFIERS = {
    IGameService: Symbol.for("IGameService"),
    ISettingsService: Symbol.for("ISettingsService"),
};

export default IDENTIFIERS;