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
        <div key={game.id} className="card h-full flex flex-col">
            <div className="card-media" style={{ height: '180px' }}>
                <img
                    alt={game.title}
                    height="180"
                    src={`${urlService.apiBaseUrl}/${game.imagePath}`}
                    width="100%"
                />
            </div>
            <div className="flex-1 flex flex-col">
                <h2
                    className="text-xl font-bold mb-2 overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{ maxWidth: '100%' }}
                    title={game.title}
                >
                    {game.title.length > 44 ? `${game.title.slice(0, 44)}...` : game.title}
                </h2>
                <p className="muted mb-4">${game.price}</p>
                <button
                    className="btn btn-primary w-full justify-center mt-auto"
                    onClick={handleAddToCart}
                >
                    Add to Cart
                </button>
            </div>
        </div>
    );
};

export default GameCard;
