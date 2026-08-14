import React from 'react';
import { Game } from '../../models/game';
import { useCart } from "../../context/cart-context";
import { Product } from '../../reducers/cart-reducer';
import container from "../../inversify.config";
import {IUrlService} from "../../iterfaces/i-url-service";
import IDENTIFIERS from "../../constants/identifiers";
import { analyticsClient } from "../../utils/analytics-client";
import SafeGameImage from "../common/SafeGameImage";
import { useSitePreferences } from "../../context/site-preferences";
import { formatMoney } from "../../utils/format-money";

interface GameCardProps {
    game: Game;
}

const GameCard: React.FC<GameCardProps> = ({ game }) => {
    const { dispatch } = useCart();
    const { currency } = useSitePreferences();

    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
    const regularPrice = Number.isFinite(game.price) ? Number(game.price) : 0;
    const finalPrice = Number.isFinite(game.finalPrice ?? game.price) ? Number(game.finalPrice ?? game.price) : regularPrice;
    const hasActiveDiscount = Boolean(game.discountActive && game.discountPercent && game.discountPercent > 0 && finalPrice < regularPrice);

    const buildItem = () => ({
        item_id: game.id ?? "",
        item_name: game.title,
        price: finalPrice,
        item_category: String(game.gameType),
        quantity: 1
    });

    const handleViewItem = () => {
        analyticsClient.trackEcommerce("view_item", {
            items: [buildItem()]
        });
    };

    const handleAddToCart = () => {
        dispatch({
            type: 'ADD_TO_CART',
            payload: {
                gameId: game.id ?? "",
                name: game.title ?? game.name,
                price: finalPrice,
                quantity: 1,
                image: game.imagePath
            } as Product,
        });

        analyticsClient.trackEcommerce("add_to_cart", {
            currency: "UAH",
            value: finalPrice,
            items: [buildItem()]
        });
    };

    return (
        <div
            key={game.id}
            className="card h-full flex flex-col"
            onClick={handleViewItem}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    handleViewItem();
                }
            }}
            role="button"
            tabIndex={0}
        >
            <div className="card-media" style={{ height: '180px' }}>
                <SafeGameImage
                    gameTitle={game.title}
                    height="180"
                    src={game.imagePath}
                    baseUrl={urlService.apiBaseUrl}
                    width="100%"
                    style={{ objectFit: "cover" }}
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
                <div className="muted mb-4">
                    {hasActiveDiscount ? (
                        <>
                            <span className="line-through mr-2">{formatMoney(regularPrice, currency)}</span>
                            <span className="font-semibold">{formatMoney(finalPrice, currency)}</span>
                            <span className="ml-2">-{Number(game.discountPercent).toFixed(0)}%</span>
                        </>
                    ) : (
                        <span>{formatMoney(finalPrice, currency)}</span>
                    )}
                </div>
                <button
                    className="btn btn-primary w-full justify-center mt-auto"
                    onClick={(event) => {
                        event.stopPropagation();
                        handleAddToCart();
                    }}
                >
                    Add to Cart
                </button>
            </div>
        </div>
    );
};

export default GameCard;
