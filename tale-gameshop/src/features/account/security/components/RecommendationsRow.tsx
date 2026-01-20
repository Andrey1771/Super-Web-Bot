import React from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faChevronLeft, faChevronRight} from '@fortawesome/free-solid-svg-icons';
import {useRecommendations} from '../../../../hooks/use-recommendations';
import RecommendationsSection from '../../../../components/recommendations/recommendations-section';
import {useCart} from '../../../../context/cart-context';

const RecommendationsRow: React.FC = () => {
    const {dispatch} = useCart();
    const {
        items: recommendations,
        isLoading: isRecommendationsLoading,
        error: recommendationsError,
        reload: reloadRecommendations
    } = useRecommendations(6);

    const handleAddToCart = (id: string, title: string, price: number, image: string) => {
        dispatch({
            type: 'ADD_TO_CART',
            payload: {
                gameId: id,
                name: title,
                price,
                quantity: 1,
                image
            }
        });
    };

    return (
        <section className="security-recommendations" data-testid="security-recommendations">
            <div className="security-recommendations-header">
                <h3>Recommendations based on your wishlist</h3>
                <div className="security-recommendations-actions">
                    <button type="button" className="btn btn-outline security-arrow-btn" aria-label="Scroll left">
                        <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    <button type="button" className="btn btn-outline security-arrow-btn" aria-label="Scroll right">
                        <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                </div>
            </div>
            <RecommendationsSection
                items={recommendations}
                isLoading={isRecommendationsLoading}
                error={recommendationsError}
                onRetry={reloadRecommendations}
                emptyMessage="Add games to your wishlist or view a few games to get recommendations."
                listClassName="security-recommendations-list"
                stateClassName="security-recommendations-state"
                renderSkeleton={(index) => (
                    <div key={`rec-skeleton-${index}`} className="card security-recommendation-card is-skeleton" />
                )}
                renderItem={(item) => (
                    <div key={item.game.id ?? item.game.title} className="card security-recommendation-card">
                        <div className="security-recommendation-media">
                            {item.game.imagePath ? (
                                <img src={item.game.imagePath} alt={item.game.title} />
                            ) : (
                                <div className="security-recommendation-fallback" aria-hidden="true" />
                            )}
                        </div>
                        <div className="security-recommendation-body">
                            <strong>{item.game.title}</strong>
                            <span className="security-recommendation-price">
                                ${Number(item.game.price).toFixed(2)}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="btn btn-primary security-recommendation-btn"
                            onClick={() =>
                                handleAddToCart(
                                    item.game.id ?? '',
                                    item.game.title,
                                    Number(item.game.price),
                                    item.game.imagePath
                                )
                            }
                            disabled={!item.game.id}
                        >
                            Add to cart
                        </button>
                    </div>
                )}
            />
        </section>
    );
};

export default RecommendationsRow;
