import React, { useRef } from 'react';
import type { GameCardItem } from '../../../models/game-details';
import RatingStars from './rating-stars';

interface RecommendationsCarouselProps {
    title: string;
    items: GameCardItem[];
}

const RecommendationsCarousel: React.FC<RecommendationsCarouselProps> = ({ title, items }) => {
    const listRef = useRef<HTMLDivElement>(null);

    const scrollList = (direction: 'left' | 'right') => {
        if (!listRef.current) {
            return;
        }
        const scrollAmount = direction === 'left' ? -320 : 320;
        listRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    };

    return (
        <section className="gd-recommendations">
            <div className="gd-recommendations-header">
                <h3>{title}</h3>
                <div className="gd-carousel-controls">
                    <button className="gd-thumb-arrow" type="button" aria-label="Scroll left" onClick={() => scrollList('left')}>
                        ‹
                    </button>
                    <button className="gd-thumb-arrow" type="button" aria-label="Scroll right" onClick={() => scrollList('right')}>
                        ›
                    </button>
                </div>
            </div>
            <div className="gd-carousel" ref={listRef}>
                {items.map((item) => (
                    <div key={item.id} className="gd-carousel-card card">
                        <div className="gd-carousel-media">
                            <img src={item.coverUrl} alt={`${item.title} cover`} loading="lazy" />
                        </div>
                        <div className="gd-carousel-body">
                            <div className="gd-carousel-title" title={item.title}>
                                {item.title}
                            </div>
                            <div className="gd-carousel-meta">
                                <span className="gd-carousel-price">${item.price.toFixed(2)}</span>
                                <RatingStars rating={item.rating} size={14} />
                            </div>
                            <button className="btn btn-primary" type="button">Add to cart</button>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default RecommendationsCarousel;
