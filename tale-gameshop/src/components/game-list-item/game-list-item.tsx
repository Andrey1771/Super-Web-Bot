import React from 'react';
import './game-list-item.css';
import {Game} from "../../models/game";
import GameCard from '../game-card/game-card';

interface GameListItemProps {
    filteredGamesByCategory: Map<string, Game[]>;
    category: string;
}

const GameListItem: React.FC<GameListItemProps> = ({filteredGamesByCategory, category}) => {
    const games = filteredGamesByCategory.get(category) || [];

    if (games.length === 0) {
        return null;
    }

    return (
        <section className="game-category-block" key={category}>
            <div className="container mx-auto px-0">
                <h2 className="text-2xl font-bold mb-4">{category}</h2>
                <div className="game-grid">
                    {games.map((game) => (
                        <GameCard key={game.id ?? game.title} game={game}/>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default GameListItem;
