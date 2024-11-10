import {Settings} from "../models/settings";

export interface ISettingsService {
    getAllSettings(): Promise<Settings[]>;
}