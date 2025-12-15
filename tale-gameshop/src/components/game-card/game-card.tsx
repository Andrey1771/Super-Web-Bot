import React from 'react';
import { Game } from '../../models/game';
import { useCart } from "../../context/cart-context";
import { Product } from '../../reducers/cart-reducer';
import container from "../../inversify.config";
import {IUrlService} from "../../iterfaces/i-url-service";
import IDENTIFIERS from "../../constants/identifiers";
import placeholder from '../../assets/images/best-gaming-platform.jpg';
import './game-card.css';

interface GameCardProps {
    game: Game;
}

const GameCard: React.FC<GameCardProps> = ({ game }) => {
    const { dispatch } = useCart();

    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    const imageSrc = game.imagePath?.startsWith('http')
        ? game.imagePath
        : `${urlService.apiBaseUrl}/${game.imagePath}`;

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
        <div key={game.id} className="game-card">
            <div className="game-card__image">
                <img
                    alt={game.title}
                    src={imageSrc}
                    onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = placeholder;
                    }}
                />
            </div>
            <h2
                className="game-card__title"
                title={game.title}
            >
                {game.title.length > 44 ? `${game.title.slice(0, 44)}...` : game.title}
            </h2>
            <p className="game-card__price">${game.price}</p>
            <button
                className="game-card__button"
                onClick={handleAddToCart}
            >
                Add to Cart
            </button>
        </div>
    );
};

export default GameCard;
