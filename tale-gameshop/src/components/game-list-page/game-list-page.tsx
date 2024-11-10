import { inject } from 'inversify';
import React, { Component } from 'react';
import IDENTIFIERS from "../../constants/identifiers";
import './game-list-page.css'
import type {IGameService} from "../../iterfaces/i-game-service";
import {resolve} from "inversify-react";
import {Game} from "../../models/game";
import type {ISettingsService} from "../../iterfaces/i-settings-service";
interface State {
    games: Game[];
    visibleGamesCount: number;
    gamesByCategory: any
}
class TaleGameshopGameList extends Component<{}, State>{
    @resolve(IDENTIFIERS.IGameService) private readonly _gameService!: IGameService;
    @resolve(IDENTIFIERS.ISettingsService) private readonly _settingsService!: ISettingsService;

    constructor(props: any) {
        super(props);
        this.state = {
            games: [],
            visibleGamesCount: 9, // Сначала отображаем 9 игр
            gamesByCategory: {}
        };
    }

    async componentDidMount() {
        // Предположим, что _gameService.getAllGames() возвращает массив игр
        const games = await this._gameService.getAllGames();
        const gamesByCategory = await this.groupGamesByCategory();
        this.setState({ games: games, gamesByCategory: gamesByCategory });
    }

    loadMoreGames = () => {
        this.setState((prevState) => ({
            visibleGamesCount: prevState.visibleGamesCount + 9,
        }));
    };

    groupGamesByCategory = async () => {
        const allSettings = await this._settingsService.getAllSettings()
        const settings = allSettings.shift();

        const { games } = this.state;
        return games.reduce((acc: any, game) => {
            const category = settings?.gameCategories[game.gameType] ?? "";
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(game);
            return acc;
        }, {});
    };

    render() {
        const { games, visibleGamesCount } = this.state;

        return (
            <main className="container mx-auto px-4 py-8">
                <h1 className="text-3xl font-bold text-center mb-4">Game List</h1>
                <p className="text-center text-gray-600 mb-8">
                    Browse our extensive collection of computer games, carefully curated to cater to every player's taste.
                </p>

                {Object.keys(this.state.gamesByCategory).map((category) => (
                    <section key={category}>
                        <h2 className="text-2xl font-bold mb-4">{category}</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                            {this.state.gamesByCategory[category]
                                .slice(0, visibleGamesCount)
                                // @ts-ignore
                                .map((game) => (
                                    <div key={game.id} className="bg-white p-4 rounded-lg shadow">
                                        <img
                                            alt={game.title}
                                            className="mb-4"
                                            height="100"
                                            src={game.image}
                                            width="100"
                                        />
                                        <h2 className="text-xl font-bold mb-2">{game.title}</h2>
                                        <p className="text-gray-600 mb-4">${game.price}</p>
                                        <button className="w-full bg-black text-white py-2 rounded hover:text-purple-600">
                                            Add to Cart
                                        </button>
                                    </div>
                                ))}
                        </div>
                    </section>
                ))}

                {games.length > visibleGamesCount && (
                    <button
                        onClick={this.loadMoreGames}
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mx-auto block"
                    >
                        Load More
                    </button>
                )}
            </main>
        );
    }
}

export default TaleGameshopGameList;