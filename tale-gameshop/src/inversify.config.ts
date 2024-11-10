import "reflect-metadata";
import { Container } from "inversify";
import {IGameService} from "./iterfaces/i-game-service";
import IDENTIFIERS from "./constants/identifiers";
import GameService from "./services/game-service";
import {ISettingsService} from "./iterfaces/i-settings-service";
import { SettingsService } from "./services/settings-service";

const container = new Container();

container.bind<IGameService>(IDENTIFIERS.IGameService).to(GameService);
container.bind<ISettingsService>(IDENTIFIERS.ISettingsService).to(SettingsService);

export default container;