import React from 'react';
import type { Review } from '../../../models/game-details';
import ReviewCard from './review-card';

interface ReviewListProps {
    reviews: Review[];
}

const ReviewList: React.FC<ReviewListProps> = ({ reviews }) => {
    return (
        <div className="gd-review-list">
            {reviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
            ))}
        </div>
    );
};

export default ReviewList;
