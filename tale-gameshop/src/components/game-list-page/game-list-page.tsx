import { inject } from 'inversify';
import React, { Component } from 'react';
import IDENTIFIERS from "../../constants/identifiers";
import './game-list-page.css'
import type  {IGameService} from "../../iterfaces/i-game-service";
import {resolve} from "inversify-react";
import {Game} from "../../models/game";

class TaleGameshopGameList extends Component {
    @resolve(IDENTIFIERS.IGameService) private readonly _gameService!: IGameService;

    constructor(props: any) {
        super(props);
    }

    private _games: Game[] = [];

    async componentDidMount() {
        this._games = await this._gameService.getAllGames();
        debugger;
    }

    render() {
        return (
            <main className="container mx-auto px-4 py-8">
                <h1 className="text-3xl font-bold text-center mb-4">
                    Game List
                </h1>
                <p className="text-center text-gray-600 mb-8">
                    Browse our extensive collection of computer games, carefully curated to cater to every player's
                    taste.
                </p>
                <h2 className="text-2xl font-bold mb-4">
                    Action Games
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-4 rounded-lg shadow">
                        <img alt="Action Game 1" className="mb-4" height="100"
                             src="https://storage.googleapis.com/a1aa/image/Lno92rIOY6LLO9k6Bcv7O4ztQuA03J89i3Jfe2d5e0uhH6WnA.jpg"
                             width="100"/>
                        <h2 className="text-xl font-bold mb-2">
                            Action Game Title 1
                        </h2>
                        <p className="text-gray-600 mb-4">
                            $29.99
                        </p>
                        <button className="w-full bg-black text-white py-2 rounded hover:text-purple-600">
                            Add to Cart
                        </button>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                        <img alt="Action Game 2" className="mb-4" height="100"
                             src="https://storage.googleapis.com/a1aa/image/07m1AgikIexHeU5YL1lCvY1uaizvarXM2mcafNEIeegBdobdC.jpg"
                             width="100"/>
                        <h2 className="text-xl font-bold mb-2">
                            Action Game Title 2
                        </h2>
                        <p className="text-gray-600 mb-4">
                            $39.99
                        </p>
                        <button className="w-full bg-black text-white py-2 rounded hover:text-purple-600">
                            Add to Cart
                        </button>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                        <img alt="Action Game 3" className="mb-4" height="100"
                             src="https://storage.googleapis.com/a1aa/image/6thZyEe1YhwJbiTksWn9Yje0B4k316G8VaafTIiXlIpTH6WnA.jpg"
                             width="100"/>
                        <h2 className="text-xl font-bold mb-2">
                            Action Game Title 3
                        </h2>
                        <p className="text-gray-600 mb-4">
                            $49.99
                        </p>
                        <button className="w-full bg-black text-white py-2 rounded hover:text-purple-600">
                            Add to Cart
                        </button>
                    </div>
                </div>
                <h2 className="text-2xl font-bold mb-4">
                    Adventure Games
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-4 rounded-lg shadow">
                        <img alt="Adventure Game 1" className="mb-4" height="100"
                             src="https://storage.googleapis.com/a1aa/image/OtpJakQ1ZUqnCpWXsZhO5fbfJ1oaGf1EoIKfI9C5pffe5hu1JA.jpg"
                             width="100"/>
                        <h2 className="text-xl font-bold mb-2">
                            Adventure Game Title 1
                        </h2>
                        <p className="text-gray-600 mb-4">
                            $29.99
                        </p>
                        <button className="w-full bg-black text-white py-2 rounded hover:text-purple-600">
                            Add to Cart
                        </button>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                        <img alt="Adventure Game 2" className="mb-4" height="100"
                             src="https://storage.googleapis.com/a1aa/image/7NhrXh32Kq53PVCwM12v5hQZpGDR6fN5pKfi0vvfj6UVH6WnA.jpg"
                             width="100"/>
                        <h2 className="text-xl font-bold mb-2">
                            Adventure Game Title 2
                        </h2>
                        <p className="text-gray-600 mb-4">
                            $39.99
                        </p>
                        <button className="w-full bg-black text-white py-2 rounded hover:text-purple-600">
                            Add to Cart
                        </button>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                        <img alt="Adventure Game 3" className="mb-4" height="100"
                             src="https://storage.googleapis.com/a1aa/image/l4LHVUKtqyoZG55yR7GFeQ1ekfrLno0VAtELifDkTyrwO0tOB.jpg"
                             width="100"/>
                        <h2 className="text-xl font-bold mb-2">
                            Adventure Game Title 3
                        </h2>
                        <p className="text-gray-600 mb-4">
                            $49.99
                        </p>
                        <button className="w-full bg-black text-white py-2 rounded hover:text-purple-600">
                            Add to Cart
                        </button>
                    </div>
                </div>
                <h2 className="text-2xl font-bold mb-4">
                    Strategy Games
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-white p-4 rounded-lg shadow">
                        <img alt="Strategy Game 1" className="mb-4" height="100"
                             src="https://storage.googleapis.com/a1aa/image/slJLpVfNfNssmEOx45lhWgxFCaQPHRdtEAVpIRvROf9iH6WnA.jpg"
                             width="100"/>
                        <h2 className="text-xl font-bold mb-2">
                            Strategy Game Title 1
                        </h2>
                        <p className="text-gray-600 mb-4">
                            $29.99
                        </p>
                        <button className="w-full bg-black text-white py-2 rounded hover:text-purple-600">
                            Add to Cart
                        </button>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                        <img alt="Strategy Game 2" className="mb-4" height="100"
                             src="https://storage.googleapis.com/a1aa/image/Z1fof5frRBaLjp1wpfpgHGhedwfD0TOY4lKu7YsTfFLQ3hu1JA.jpg"
                             width="100"/>
                        <h2 className="text-xl font-bold mb-2">
                            Strategy Game Title 2
                        </h2>
                        <p className="text-gray-600 mb-4">
                            $39.99
                        </p>
                        <button className="w-full bg-black text-white py-2 rounded hover:text-purple-600">
                            Add to Cart
                        </button>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                        <img alt="Strategy Game 3" className="mb-4" height="100"
                             src="https://storage.googleapis.com/a1aa/image/e1hoIDLyB2RLFSVn5uy2lp3g0IQp8IWTPadOYx2Rsrh2hu1JA.jpg"
                             width="100"/>
                        <h2 className="text-xl font-bold mb-2">
                            Strategy Game Title 3
                        </h2>
                        <p className="text-gray-600 mb-4">
                            $49.99
                        </p>
                        <button className="w-full bg-black text-white py-2 rounded hover:text-purple-600">
                            Add to Cart
                        </button>
                    </div>
                </div>
            </main>
        );
    }
}

export default TaleGameshopGameList;

