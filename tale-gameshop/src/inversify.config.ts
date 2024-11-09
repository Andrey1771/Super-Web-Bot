import "reflect-metadata";
import { Container } from "inversify";
import {IGameService} from "./iterfaces/i-game-service";
import IDENTIFIERS from "./constants/identifiers";
import GameService from "./services/game-service";

const container = new Container();

container.bind<IGameService>(IDENTIFIERS.IGameService).to(GameService);
export default container;