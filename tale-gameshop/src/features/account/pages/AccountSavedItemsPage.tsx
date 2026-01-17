import React, { useEffect, useMemo, useState } from 'react';
import {Link} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
    faMagnifyingGlass,
    faChevronLeft,
    faChevronRight,
    faArrowLeft,
    faArrowRight
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import IDENTIFIERS from '../../../constants/identifiers';
import container from '../../../inversify.config';
import { Game } from '../../../models/game';
import type { IWishlistService } from '../../../iterfaces/i-wishlist-service';
import type { IKeycloakService } from '../../../iterfaces/i-keycloak-service';
import type { IUrlService } from '../../../iterfaces/i-url-service';
import { useCart } from '../../../context/cart-context';
import { Product } from '../../../reducers/cart-reducer';
import './account-saved-items-page.css';

type Recommendation = {
    id: string;
    title: string;
    price: string;
    coverClass: string;
};

type RecentlyViewed = {
    id: string;
    title: string;
    subtitle: string;
    price: string;
    coverClass: string;
};

const recommendations: Recommendation[] = [
    {id: 'rec-1', title: 'Dying Light 2', price: '$19.99', coverClass: 'saved-cover-dying-light'},
    {id: 'rec-2', title: 'Dark Souls', price: '$59.99', coverClass: 'saved-cover-dark-souls'},
    {id: 'rec-3', title: 'The Witcher 3', price: '$29.99', coverClass: 'saved-cover-witcher'},
    {id: 'rec-4', title: 'God of War', price: '$49.99', coverClass: 'saved-cover-god-of-war'}
];

const recentlyViewed: RecentlyViewed[] = [
    {
        id: 'recent-1',
        title: "Baldur's Gate 3",
        subtitle: 'March 25, 2023',
        price: '$59.99',
        coverClass: 'saved-cover-baldurs'
    },
    {
        id: 'recent-2',
        title: 'Elden Ring',
        subtitle: 'Elden Ring',
        price: '$59.99',
        coverClass: 'saved-cover-elden'
    },
    {
        id: 'recent-3',
        title: 'Resident Evil',
        subtitle: 'Assessed with vintage',
        price: '$39.99',
        coverClass: 'saved-cover-resident'
    },
    {
        id: 'recent-4',
        title: 'Lies of P',
        subtitle: 'BB2 25',
        price: '$49.99',
        coverClass: 'saved-cover-lies'
    }
];

const AccountSavedItemsPage: React.FC = () => {
    const viewMode: 'comfortable' | 'compact' = 'comfortable';
    const [wishlistGames, setWishlistGames] = useState<Game[]>([]);
    const [wishlistUserId, setWishlistUserId] = useState<string>('');
    const wishlistService = container.get<IWishlistService>(IDENTIFIERS.IWishlistService);
    const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
    const { dispatch } = useCart();

    useEffect(() => {
        const syncUser = () => {
            const parsedToken = keycloakService.keycloak?.tokenParsed as { email?: string } | undefined;
            setWishlistUserId(parsedToken?.email ?? '');
        };

        syncUser();
        keycloakService.stateChangedEmitter.off('onAuthSuccess', syncUser);
        keycloakService.stateChangedEmitter.on('onAuthSuccess', syncUser);

        return () => {
            keycloakService.stateChangedEmitter.off('onAuthSuccess', syncUser);
        };
    }, [keycloakService]);

    useEffect(() => {
        if (!wishlistUserId) {
            setWishlistGames([]);
            return;
        }

        let isMounted = true;

        const loadWishlist = async () => {
            try {
                const wishlist = await wishlistService.getWishlist(wishlistUserId);
                if (isMounted) {
                    setWishlistGames(wishlist);
                }
            } catch (error) {
                console.error('Failed to load wishlist:', error);
            }
        };

        loadWishlist();

        return () => {
            isMounted = false;
        };
    }, [wishlistUserId, wishlistService]);

    const totalWishlistItems = wishlistGames.length;
    const visibleItems = Math.min(totalWishlistItems, 9);
    const visibleLabel = totalWishlistItems === 0 ? 'Showing 0 of 0' : `Showing 1-${visibleItems} of ${totalWishlistItems}`;

    const wishlistCards = useMemo(() => wishlistGames.slice(0, 9), [wishlistGames]);

    const formatPrice = (price: number) => (Number.isFinite(price) ? `$${price.toFixed(2)}` : '$0');

    const formatDate = (releaseDate: string) => {
        const date = new Date(releaseDate);
        return Number.isNaN(date.valueOf()) ? 'Release date TBD' : date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const handleRemove = async (gameId?: string) => {
        if (!wishlistUserId || !gameId) {
            return;
        }

        try {
            await wishlistService.removeFromWishlist(wishlistUserId, gameId);
            setWishlistGames((prev) => prev.filter((game) => game.id !== gameId));
        } catch (error) {
            console.error('Failed to remove wishlist item:', error);
        }
    };

    const handleAddToCart = (game: Game) => {
        dispatch({
            type: 'ADD_TO_CART',
            payload: {
                gameId: game.id ?? '',
                name: game.name,
                price: game.price,
                quantity: 1,
                image: game.imagePath
            } as Product
        });
    };

    const resolveCoverStyle = (game: Game) => {
        if (!game.imagePath) {
            return undefined;
        }

        return {
            backgroundImage: `url(${urlService.apiBaseUrl}/${game.imagePath})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
        };
    };

    return (
        <AccountShell
            title={`Saved items (${totalWishlistItems})`}
            sectionLabel="Saved items"
            subtitle="Items saved to your wishlist for future purchase."
            actions={(
                <>
                    <Link to="/account/settings" className="btn btn-outline account-action-btn">
                        Edit profile
                    </Link>
                    <Link to="/support" className="btn btn-primary account-action-btn">
                        Support
                    </Link>
                </>
            )}
        >
            <div className="card saved-toolbar" data-testid="saved-toolbar">
                <div className="saved-toolbar-top">
                    <div className="saved-search">
                        <FontAwesomeIcon icon={faMagnifyingGlass} className="saved-search-icon" />
                        <input type="text" placeholder="Search in wishlist..." />
                    </div>
                    <div className="saved-sort">
                        <span>Sort:</span>
                        <select className="saved-select" defaultValue="All">
                            <option>All</option>
                            <option>Price</option>
                            <option>Newest</option>
                        </select>
                    </div>
                </div>
                <div className="saved-toolbar-row">
                    <div className="saved-view-toggle">
                        <span>View:</span>
                        <button type="button" className="btn btn-outline saved-view-btn is-active">
                            Comfortable
                        </button>
                        <button type="button" className="btn btn-outline saved-view-btn">
                            Compact
                        </button>
                    </div>
                    <span className="saved-toolbar-note">{visibleLabel}</span>
                </div>
            </div>

            <div className="card saved-items-panel" data-testid="saved-grid">
                <div className={`saved-items-grid view-${viewMode}`}>
                    {viewMode === 'comfortable'
                        ? wishlistCards.map((item, index) => (
                            <div key={item.id ?? `${item.title}-${index}`} className="card saved-item-card">
                                <div className="saved-item-cover" style={resolveCoverStyle(item)} aria-hidden="true" />
                                <div className="saved-item-body">
                                    <div className="saved-item-title-row">
                                        <div>
                                            <h3>{item.title}</h3>
                                            <p className="saved-item-date">{formatDate(item.releaseDate)}</p>
                                        </div>
                                        <div className="saved-item-price">
                                            <span>{formatPrice(item.price)}</span>
                                        </div>
                                    </div>
                                    <div className="saved-item-actions">
                                        <button
                                            type="button"
                                            className="btn btn-primary saved-item-btn"
                                            onClick={() => handleAddToCart(item)}
                                        >
                                            Add to cart
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-outline saved-item-btn"
                                            onClick={() => handleRemove(item.id)}
                                        >
                                            Remove
                                        </button>
                                        {index === 2 && (
                                            <button type="button" className="btn btn-outline saved-item-icon-btn" aria-label="Open item">
                                                <FontAwesomeIcon icon={faChevronRight} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                        : wishlistCards.map((item, index) => (
                            <div key={item.id ?? `${item.title}-${index}`} className="card saved-item-card compact">
                                <div className="saved-item-compact-cover" style={resolveCoverStyle(item)} aria-hidden="true" />
                                <div className="saved-item-compact-body">
                                    <div className="saved-item-compact-header">
                                        <div>
                                            <strong>{item.title}</strong>
                                            <span className="saved-item-date">{formatDate(item.releaseDate)}</span>
                                        </div>
                                        <div className="saved-item-price">
                                            <span>{formatPrice(item.price)}</span>
                                        </div>
                                    </div>
                                    <div className="saved-item-actions">
                                        <button
                                            type="button"
                                            className="btn btn-primary saved-item-btn"
                                            onClick={() => handleAddToCart(item)}
                                        >
                                            Add to cart
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-outline saved-item-btn"
                                            onClick={() => handleRemove(item.id)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    {wishlistCards.length === 0 && (
                        <div className="saved-empty-state">
                            <p>Your wishlist is empty for now.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="saved-pagination" data-testid="saved-pagination">
                <div className="saved-pagination-controls">
                    <button type="button" className="btn btn-outline saved-page-btn" aria-label="Previous page">
                        <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    <button type="button" className="btn btn-outline saved-page-btn is-active">
                        1
                    </button>
                    <button type="button" className="btn btn-outline saved-page-btn">
                        2
                    </button>
                    <button type="button" className="btn btn-outline saved-page-btn">
                        3
                    </button>
                    <span className="saved-page-ellipsis">…</span>
                    <button type="button" className="btn btn-outline saved-page-btn">
                        6
                    </button>
                    <button type="button" className="btn btn-outline saved-page-btn" aria-label="Next page">
                        <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                </div>
                <span className="saved-pagination-note">{visibleLabel}</span>
            </div>

            <section className="saved-recommendations" data-testid="saved-recommendations">
                <div className="saved-section-header">
                    <h3>Recommendations based on your wishlist</h3>
                    <div className="saved-section-arrows">
                        <button type="button" className="btn btn-outline saved-arrow-btn" aria-label="Scroll left">
                            <FontAwesomeIcon icon={faArrowLeft} />
                        </button>
                        <button type="button" className="btn btn-outline saved-arrow-btn" aria-label="Scroll right">
                            <FontAwesomeIcon icon={faArrowRight} />
                        </button>
                    </div>
                </div>
                <div className="saved-horizontal-list">
                    {recommendations.map((item) => (
                        <div key={item.id} className="card saved-horizontal-card">
                            <div className={`saved-horizontal-cover ${item.coverClass}`} aria-hidden="true" />
                            <div className="saved-horizontal-body">
                                <strong>{item.title}</strong>
                                <span className="saved-horizontal-price">{item.price}</span>
                            </div>
                            <button type="button" className="btn btn-primary saved-horizontal-btn">
                                Add to cart
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            <section className="saved-recently-viewed" data-testid="saved-recently-viewed">
                <div className="saved-section-header">
                    <h3>Recently viewed</h3>
                    <div className="saved-section-arrows">
                        <button type="button" className="btn btn-outline saved-arrow-btn" aria-label="Scroll left">
                            <FontAwesomeIcon icon={faArrowLeft} />
                        </button>
                        <button type="button" className="btn btn-outline saved-arrow-btn" aria-label="Scroll right">
                            <FontAwesomeIcon icon={faArrowRight} />
                        </button>
                    </div>
                </div>
                <div className="saved-horizontal-list">
                    {recentlyViewed.map((item) => (
                        <div key={item.id} className="card saved-horizontal-card">
                            <div className={`saved-horizontal-cover ${item.coverClass}`} aria-hidden="true" />
                            <div className="saved-horizontal-body">
                                <strong>{item.title}</strong>
                                <span className="saved-horizontal-subtitle">{item.subtitle}</span>
                                <span className="saved-horizontal-price">{item.price}</span>
                            </div>
                            <button type="button" className="btn btn-primary saved-horizontal-btn">
                                Add to cart
                            </button>
                        </div>
                    ))}
                </div>
            </section>
        </AccountShell>
    );
};

export default AccountSavedItemsPage;
