import React from 'react';
import { Game } from '../../models/game';

interface GameCardProps {
    game: Game;
}

const GameCard: React.FC<GameCardProps> = ({ game }) => {
    return (
        <div key={game.id} className="bg-white p-4 rounded-lg shadow">
            <img
                alt={game.title}
                className="mb-4"
                height="100"
                src={`https://localhost:7117/${game.imagePath}`}
                width="100"
            />
            <h2 className="text-xl font-bold mb-2">{game.title}</h2>
            <p className="text-gray-600 mb-4">${game.price}</p>
            <button className="w-full bg-black text-white py-2 rounded hover:text-purple-600">
                Add to Cart
            </button>
        </div>
    );
};

export default GameCard;