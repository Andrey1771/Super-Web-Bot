import React from 'react';

interface RatingStarsProps {
    rating: number;
    size?: number;
    className?: string;
}

const RatingStars: React.FC<RatingStarsProps> = ({ rating, size = 16, className }) => {
    return (
        <div className={`gd-rating-stars ${className ?? ''}`.trim()} aria-label={`Rating ${rating} out of 5`}>
            {Array.from({ length: 5 }).map((_, index) => {
                const isFilled = rating >= index + 1;
                const isHalf = rating > index && rating < index + 1;
                return (
                    <span
                        key={`star-${index}`}
                        className={`gd-star ${isFilled ? 'gd-star-filled' : ''} ${isHalf ? 'gd-star-half' : ''}`}
                        style={{ fontSize: size }}
                        aria-hidden="true"
                    >
                        ★
                    </span>
                );
            })}
        </div>
    );
};

export default RatingStars;
