import React, {useMemo, useState} from 'react';
import { Game } from '../../models/game';
import { useCart } from "../../context/cart-context";
import { Product } from '../../reducers/cart-reducer';
import container from "../../inversify.config";
import {IUrlService} from "../../iterfaces/i-url-service";
import IDENTIFIERS from "../../constants/identifiers";
import './game-card.css';

import placeholderOne from "../../assets/images/placeholder-1.svg";
import placeholderTwo from "../../assets/images/placeholder-2.svg";
import placeholderThree from "../../assets/images/placeholder-3.svg";

interface GameCardProps {
    game: Game;
    categoryTitle?: string;
}

const GameCard: React.FC<GameCardProps> = ({ game, categoryTitle }) => {
    const { dispatch } = useCart();
    const [imageSrc, setImageSrc] = useState<string>('');

    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    const placeholders = useMemo(() => [placeholderOne, placeholderTwo, placeholderThree], []);

    const fallbackImage = useMemo(() => {
        if (!game.id) {
            return placeholders[0];
        }

        const codeSum = game.id
            .split('')
            .reduce((sum, char) => sum + char.charCodeAt(0), 0);

        const index = Math.abs(codeSum) % placeholders.length;
        return placeholders[index];
    }, [game.id, placeholders]);

    const resolvedImage = imageSrc || `${urlService.apiBaseUrl}/${game.imagePath}`;

    const handleImageError = () => {
        setImageSrc(fallbackImage);
    };

    const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
        if (!event.currentTarget.src) {
            setImageSrc(fallbackImage);
        }
    };

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
        <div key={game.id} className="card game-card">
            <div className="game-card__image-wrapper">
                <img
                    alt={game.title}
                    className="game-card__image"
                    src={resolvedImage}
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                />
            </div>
            <div className="game-card__body">
                <h2 className="game-card__title" title={game.title}>
                    {game.title}
                </h2>
                <div className="game-card__meta">
                    <span className="badge">{categoryTitle ?? 'Game'}</span>
                    <span className="game-card__price">${game.price}</span>
                </div>
                <button
                    className="btn btn-primary game-card__button"
                    onClick={handleAddToCart}
                >
                    Add to cart
                </button>
            </div>
        </div>
    );
};

export default GameCard;
