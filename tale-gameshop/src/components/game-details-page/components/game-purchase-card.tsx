import React from 'react';
import type { Pricing, ReviewSummary } from '../../../models/game-details';
import RatingStars from './rating-stars';

interface GamePurchaseCardProps {
    pricing: Pricing;
    ratingSummary: ReviewSummary;
}

const GamePurchaseCard: React.FC<GamePurchaseCardProps> = ({ pricing, ratingSummary }) => {
    return (
        <div className="card gd-purchase-card">
            <div className="gd-price-row">
                <div className="gd-price">
                    {pricing.currency}
                    {pricing.price.toFixed(2)}
                </div>
                {pricing.oldPrice && (
                    <div className="gd-old-price">
                        {pricing.currency}
                        {pricing.oldPrice.toFixed(2)}
                    </div>
                )}
                {pricing.discountPercent && (
                    <span className="gd-discount">-{pricing.discountPercent}%</span>
                )}
            </div>
            <div className="gd-rating-summary">
                <RatingStars rating={ratingSummary.score} />
                <span className="gd-rating-score">{ratingSummary.score.toFixed(1)}</span>
                <span className="gd-rating-count">({ratingSummary.reviewCount.toLocaleString()} reviews)</span>
            </div>
            <span className="gd-rating-label">{ratingSummary.label}</span>
            <div className="gd-purchase-actions">
                <button className="btn btn-primary" type="button">Add to cart</button>
                <button className="btn btn-outline" type="button">Wishlist</button>
            </div>
            <div className="gd-purchase-note">
                Instant delivery • Official key • Refund policy
            </div>
        </div>
    );
};

export default GamePurchaseCard;
