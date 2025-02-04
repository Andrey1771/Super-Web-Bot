import React from 'react';
import { Game } from '../../models/game';
import { useCart } from "../../context/cart-context";
import { Product } from '../../reducers/cart-reducer';
import container from "../../inversify.config";
import {IUrlService} from "../../iterfaces/i-url-service";
import IDENTIFIERS from "../../constants/identifiers";

interface GameCardProps {
    game: Game;
}

const GameCard: React.FC<GameCardProps> = ({ game }) => {
    const { dispatch } = useCart();

    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    const handleAddToCart = () => {
        dispatch({
            type: 'ADD_TO_CART',
            payload: {
                gameId: game.id ?? "",
                name: game.name,
                price: game.price,
                quantity: 1,
                image: game.imagePath
            } as Product,
        });
    };

    return (
        <div key={game.id} className="bg-white p-4 rounded-lg shadow">
            <img
                alt={game.title}
                style={{ height: '100px', width: '100px' }}
                className="mb-4"
                height="100px"
                src={`${urlService.apiBaseUrl}/${game.imagePath}`}
                width="100px"
            />
            <h2
                className="text-xl font-bold mb-2 overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ maxWidth: '200px' }} // Ограничиваем ширину блока
                title={game.title} // Всплывающая подсказка
            >
                {game.title.length > 44 ? `${game.title.slice(0, 44)}...` : game.title}
            </h2>
            <p className="text-gray-600 mb-4">${game.price}</p>
            <button
                className="w-full bg-black text-white py-2 rounded hover:text-purple-600"
                onClick={handleAddToCart}
            >
                Add to Cart
            </button>
        </div>
    );
};

export default GameCard;
