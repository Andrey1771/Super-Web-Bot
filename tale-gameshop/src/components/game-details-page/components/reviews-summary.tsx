import React from 'react';
import type { ReviewSummary } from '../../../models/game-details';
import RatingStars from './rating-stars';

interface ReviewsSummaryProps {
    summary: ReviewSummary;
}

const ReviewsSummary: React.FC<ReviewsSummaryProps> = ({ summary }) => {
    return (
        <div className="card gd-reviews-summary">
            <div className="gd-reviews-overall">
                <div className="gd-reviews-score">{summary.score.toFixed(1)}</div>
                <RatingStars rating={summary.score} size={18} />
                <div className="gd-reviews-count">{summary.reviewCount.toLocaleString()} reviews</div>
            </div>
            <div className="gd-reviews-label">{summary.label}</div>
            <div className="gd-review-breakdown">
                {summary.breakdown.map((item) => (
                    <div key={`rating-${item.rating}`} className="gd-review-bar">
                        <span>{item.rating}</span>
                        <div className="gd-review-bar-track">
                            <div className="gd-review-bar-fill" style={{ width: `${item.percent}%` }}></div>
                        </div>
                        <span>{item.percent}%</span>
                    </div>
                ))}
            </div>
            <div className="gd-review-tags">
                {summary.tags.map((tag) => (
                    <span key={tag} className="gd-chip">{tag}</span>
                ))}
            </div>
        </div>
    );
};

export default ReviewsSummary;
