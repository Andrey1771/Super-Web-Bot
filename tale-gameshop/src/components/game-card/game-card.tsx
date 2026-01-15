import React from 'react';
import { Game } from '../../models/game';
import { useCart } from "../../context/cart-context";
import { Product } from '../../reducers/cart-reducer';
import container from "../../inversify.config";
import {IUrlService} from "../../iterfaces/i-url-service";
import IDENTIFIERS from "../../constants/identifiers";
import {useWishlist} from "../../context/wishlist-context";

interface GameCardProps {
    game: Game;
}

const GameCard: React.FC<GameCardProps> = ({ game }) => {
    const { dispatch } = useCart();
    const { state: wishlistState, toggleWishlist } = useWishlist();

    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
    const isWishlisted = wishlistState.items.some((item) => item.gameId === (game.id ?? ""));

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
            <div className="card-media relative" style={{ height: '180px' }}>
                <img
                    alt={game.title}
                    height="180"
                    src={`${urlService.apiBaseUrl}/${game.imagePath}`}
                    width="100%"
                />
                <button
                    type="button"
                    className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/90 text-lg shadow-sm transition ${
                        isWishlisted ? 'text-[#e2438c]' : 'text-[#b3a8dc]'
                    }`}
                    onClick={() =>
                        toggleWishlist({
                            gameId: game.id ?? "",
                            name: game.title,
                            price: game.price,
                            image: game.imagePath
                        })
                    }
                    aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={isWishlisted ? 'currentColor' : 'none'}>
                        <path
                            d="M12 20.5c-4.5-3.7-7.5-6.4-7.5-10a4.5 4.5 0 0 1 8-2.8 4.5 4.5 0 0 1 8 2.8c0 3.6-3 6.3-7.5 10l-0.5 0.4-0.5-0.4Z"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                        />
                    </svg>
                </button>
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
