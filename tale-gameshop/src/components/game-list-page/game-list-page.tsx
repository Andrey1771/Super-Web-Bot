import React, { Component } from 'react';
import IDENTIFIERS from "../../constants/identifiers";
import './game-list-page.css';
import { resolve } from "inversify-react";
import { Game } from "../../models/game";
import type { IGameService } from "../../iterfaces/i-game-service";
import type { ISettingsService } from "../../iterfaces/i-settings-service";
import GameCard from '../game-card/game-card';

interface State {
    games: Game[];
    visibleGamesCount: number;
    gamesByCategory: Map<string, Game[]>;
}

class TaleGameshopGameList extends Component<{}, State> {
    @resolve(IDENTIFIERS.IGameService) private readonly _gameService!: IGameService;
    @resolve(IDENTIFIERS.ISettingsService) private readonly _settingsService!: ISettingsService;

    private readonly loadMoreStep = 9;

    constructor(props: any) {
        super(props);
        this.state = {
            games: [],
            visibleGamesCount: this.loadMoreStep,
            gamesByCategory: new Map<string, Game[]>,
        };
    }

    async componentDidMount() {
        const games = await this._gameService.getAllGames();
        this.setState({ games });
        let gamesByCategory = await this.groupGamesByCategory();
        const url = new URL(window.location.href); // Получаем текущий URL
        const filterCategory = url.searchParams.get("filterCategory");
        if (filterCategory) {
            gamesByCategory = new Map<string, Game[]>(
                Array.from(gamesByCategory.entries())
                    .filter((game: any) => game[0] === filterCategory.trim())//TODO!!!!!!!
            );
        }
        this.setState({ games, gamesByCategory });
    }

    loadMoreGames = () => {
        this.setState((prevState) => ({
            visibleGamesCount: prevState.visibleGamesCount + this.loadMoreStep,
        }));
    };

    groupGamesByCategory = async () => {
        const allSettings = await this._settingsService.getAllSettings();
        const settings = allSettings.shift();

        const { games } = this.state;
        return games.reduce((acc, game) => {
            const category = settings?.gameCategories[game.gameType] ?? "";
            if (!acc.has(category)) {
                acc.set(category, []);
            }
            acc.get(category)!.push(game);
            return acc;
        }, new Map<string, Game[]>());
    };

    render() {
        const { games, visibleGamesCount } = this.state;

        return (
            <div className="w-screen bg-gray-100">
                {<main className="container mx-auto px-4 py-8 ">
                    <h1 className="text-3xl font-bold text-center mb-4">Game List</h1>
                    <p className="text-center text-gray-600 mb-8">
                        Browse our extensive collection of computer games, carefully curated to cater to every player's taste.
                    </p>

                    {Array.from(this.state.gamesByCategory.keys()).map((category) => (
                        <section key={category}>
                            <h2 className="text-2xl font-bold mb-4">{category}</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                                {this.state.gamesByCategory.get(category)
                                    ?.slice(0, visibleGamesCount)
                                    .map((game: Game) => (
                                        <GameCard key={game.id} game={game} /> // Используем GameCard
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
                </main>}
            </div>
        );
    }
}

export default TaleGameshopGameList;