import React, { useState } from 'react';
import type { Review } from '../../../models/game-details';
import RatingStars from './rating-stars';

interface ReviewCardProps {
    review: Review;
}

const ReviewCard: React.FC<ReviewCardProps> = ({ review }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <article className="card gd-review-card">
            <div className="gd-review-header">
                <div className="gd-review-user">
                    {review.avatarUrl ? (
                        <img src={review.avatarUrl} alt={`${review.userName} avatar`} />
                    ) : (
                        <div className="gd-review-avatar-placeholder">👤</div>
                    )}
                    <div>
                        <div className="gd-review-name">{review.userName}</div>
                        <div className="gd-review-meta">
                            {review.verified && <span className="gd-chip">Verified purchase</span>}
                            {review.playtimeHours && (
                                <span className="gd-review-playtime">{review.playtimeHours}h played</span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="gd-review-rating">
                    <RatingStars rating={review.rating} />
                    <span className="gd-review-date">{review.createdAt}</span>
                </div>
            </div>
            <div className={`gd-review-text ${expanded ? 'is-expanded' : ''}`}>
                {review.text}
            </div>
            <button
                className="gd-read-more"
                type="button"
                onClick={() => setExpanded((value) => !value)}
            >
                {expanded ? 'Show less' : 'Read more'}
            </button>
            {review.screenshotUrl && (
                <img className="gd-review-screenshot" src={review.screenshotUrl} alt="Review screenshot" />
            )}
            <div className="gd-review-actions">
                <button className="btn btn-outline" type="button">👍 Helpful ({review.helpfulCount})</button>
                <button className="btn btn-outline" type="button" disabled title="Coming soon">
                    Report
                </button>
            </div>
        </article>
    );
};

export default ReviewCard;
