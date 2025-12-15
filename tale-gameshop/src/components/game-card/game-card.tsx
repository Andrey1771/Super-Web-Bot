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

    const placeholder = '/images/game-placeholder.svg';
    const buildImageSrc = () => {
        if (!game.imagePath) {
            return placeholder;
        }

        if (game.imagePath.startsWith('http')) {
            return game.imagePath;
        }

        if (game.imagePath.startsWith('/')) {
            return game.imagePath;
        }

        return `${urlService.apiBaseUrl}/${game.imagePath}`;
    };

    const imageSrc = buildImageSrc();

    return (
        <div key={game.id} className="bg-white p-4 rounded-lg shadow flex flex-col h-full">
            <div className="w-full h-48 mb-4 overflow-hidden rounded-lg bg-gray-100">
                <img
                    alt={game.title}
                    className="w-full h-full object-cover"
                    src={imageSrc}
                    onError={(event) => {
                        const target = event.target as HTMLImageElement;
                        if (target.src !== placeholder) {
                            target.src = placeholder;
                        }
                    }}
                />
            </div>
            <div className="flex-1">
                <h2
                    className="text-xl font-bold mb-2 overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{ maxWidth: '100%' }}
                    title={game.title}
                >
                    {game.title.length > 44 ? `${game.title.slice(0, 44)}...` : game.title}
                </h2>
                <p className="text-gray-600 mb-4">${game.price.toFixed(2)}</p>
            </div>
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
