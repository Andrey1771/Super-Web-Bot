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
import type { IGameService } from '../../../iterfaces/i-game-service';
import { useWishlist } from '../../../context/wishlist-context';
import { useCart } from '../../../context/cart-context';
import { Product } from '../../../reducers/cart-reducer';
import { useRecommendations } from '../../../hooks/use-recommendations';
import { useViewedGames } from '../../../hooks/use-viewed-games';
import RecommendationsSection from '../../../components/recommendations/recommendations-section';
import SafeGameImage from '../../../components/common/SafeGameImage';
import { slugify } from '../../../utils/slugify';
import './account-saved-items-page.css';

const PAGE_SIZE = 6;

const AccountSavedItemsPage: React.FC = () => {
    const [viewMode, setViewMode] = useState<'comfortable' | 'compact'>('comfortable');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState<'all' | 'price' | 'newest'>('all');
    const [page, setPage] = useState(1);
    const [games, setGames] = useState<Game[]>([]);
    const { ids: wishlistIds, remove } = useWishlist();
    const gameService = container.get<IGameService>(IDENTIFIERS.IGameService);
    const { dispatch } = useCart();
    const {
        items: recommendations,
        isLoading: isRecommendationsLoading,
        error: recommendationsError,
        reload: reloadRecommendations
    } = useRecommendations(6);
    const {
        items: viewedItems,
        isLoading: isViewedLoading,
        error: viewedError,
        reload: reloadViewed
    } = useViewedGames(6);

    useEffect(() => {
        (async () => {
            const allGames = await gameService.getAllGames();
            setGames(allGames);
        })();
    }, [gameService]);

    const wishlistGames = useMemo(
        () => games.filter((game) => game.id && wishlistIds.has(game.id)),
        [games, wishlistIds]
    );

    const totalWishlistItems = wishlistGames.length;

    const filteredGames = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const filtered = query
            ? wishlistGames.filter((game) => (game.title || game.name || '').toLowerCase().includes(query))
            : wishlistGames;

        const sorted = [...filtered];
        if (sortOrder === 'price') {
            sorted.sort((a, b) => Number(a.price) - Number(b.price));
        } else if (sortOrder === 'newest') {
            sorted.sort((a, b) => new Date(b.releaseDate).valueOf() - new Date(a.releaseDate).valueOf());
        }
        return sorted;
    }, [wishlistGames, searchQuery, sortOrder]);

    const totalFiltered = filteredGames.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

    // Если фильтр или удаление сократили список — не зависаем на несуществующей странице.
    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const safePage = Math.min(page, totalPages);
    const wishlistCards = useMemo(
        () => filteredGames.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
        [filteredGames, safePage]
    );

    const showingFrom = totalFiltered === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
    const showingTo = Math.min(safePage * PAGE_SIZE, totalFiltered);
    const visibleLabel =
        totalFiltered === 0 ? 'Showing 0 of 0' : `Showing ${showingFrom}-${showingTo} of ${totalFiltered}`;

    const formatPrice = (price: number) => (Number.isFinite(price) ? `$${price.toFixed(2)}` : '$0');

    const formatDate = (releaseDate: string) => {
        const date = new Date(releaseDate);
        return Number.isNaN(date.valueOf()) ? 'Release date TBD' : date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const gameHref = (game: Game) =>
        `/games/${game.slug ? slugify(game.slug) : slugify(game.title || game.name)}`;

    const handleRemove = async (gameId?: string) => {
        if (!gameId) {
            return;
        }
        await remove(gameId);
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




    return (
        <AccountShell
            title={`Saved items (${totalWishlistItems})`}
            sectionLabel="Saved items"
            subtitle="Items saved to your wishlist for future purchase."
        >
            <div className="card saved-toolbar" data-testid="saved-toolbar">
                <div className="saved-toolbar-top">
                    <div className="saved-search">
                        <FontAwesomeIcon icon={faMagnifyingGlass} className="saved-search-icon" />
                        <input
                            type="text"
                            placeholder="Search in wishlist..."
                            value={searchQuery}
                            onChange={(event) => {
                                setSearchQuery(event.target.value);
                                setPage(1);
                            }}
                        />
                    </div>
                    <div className="saved-sort">
                        <span>Sort:</span>
                        <select
                            className="saved-select"
                            value={sortOrder}
                            onChange={(event) => {
                                setSortOrder(event.target.value as 'all' | 'price' | 'newest');
                                setPage(1);
                            }}
                        >
                            <option value="all">All</option>
                            <option value="price">Price</option>
                            <option value="newest">Newest</option>
                        </select>
                    </div>
                </div>
                <div className="saved-toolbar-row">
                    <div className="saved-view-toggle">
                        <span>View:</span>
                        <button
                            type="button"
                            className={`btn btn-outline saved-view-btn ${viewMode === 'comfortable' ? 'is-active' : ''}`}
                            onClick={() => setViewMode('comfortable')}
                        >
                            Comfortable
                        </button>
                        <button
                            type="button"
                            className={`btn btn-outline saved-view-btn ${viewMode === 'compact' ? 'is-active' : ''}`}
                            onClick={() => setViewMode('compact')}
                        >
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
                                <Link to={gameHref(item)} className="saved-item-cover" aria-label={`Open ${item.title}`}>
                                    <SafeGameImage
                                        src={item.imagePath}
                                        gameTitle={item.title}
                                        className="saved-item-image"
                                    />
                                </Link>
                                <div className="saved-item-body">
                                    <div className="saved-item-title-row">
                                        <div>
                                            <Link to={gameHref(item)} className="saved-item-title-link">
                                                <h3>{item.title}</h3>
                                            </Link>
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
                                    </div>
                                </div>
                            </div>
                        ))
                        : wishlistCards.map((item, index) => (
                            <div key={item.id ?? `${item.title}-${index}`} className="card saved-item-card compact">
                                <Link to={gameHref(item)} className="saved-item-compact-cover" aria-label={`Open ${item.title}`}>
                                    <SafeGameImage
                                        src={item.imagePath}
                                        gameTitle={item.title}
                                        className="saved-item-image"
                                    />
                                </Link>
                                <div className="saved-item-compact-body">
                                    <div className="saved-item-compact-header">
                                        <div>
                                            <Link to={gameHref(item)} className="saved-item-title-link">
                                                <strong>{item.title}</strong>
                                            </Link>
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
                            <p>
                                {totalWishlistItems === 0
                                    ? 'Your wishlist is empty for now.'
                                    : 'No saved items match your search.'}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {totalPages > 1 && (
                <div className="saved-pagination" data-testid="saved-pagination">
                    <div className="saved-pagination-controls">
                        <button
                            type="button"
                            className="btn btn-outline saved-page-btn"
                            aria-label="Previous page"
                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            disabled={safePage <= 1}
                        >
                            <FontAwesomeIcon icon={faChevronLeft} />
                        </button>
                        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                            <button
                                key={pageNumber}
                                type="button"
                                className={`btn btn-outline saved-page-btn ${pageNumber === safePage ? 'is-active' : ''}`}
                                onClick={() => setPage(pageNumber)}
                            >
                                {pageNumber}
                            </button>
                        ))}
                        <button
                            type="button"
                            className="btn btn-outline saved-page-btn"
                            aria-label="Next page"
                            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={safePage >= totalPages}
                        >
                            <FontAwesomeIcon icon={faChevronRight} />
                        </button>
                    </div>
                    <span className="saved-pagination-note">{visibleLabel}</span>
                </div>
            )}

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
                <RecommendationsSection
                    items={recommendations}
                    isLoading={isRecommendationsLoading}
                    error={recommendationsError}
                    onRetry={reloadRecommendations}
                    emptyMessage="Add games to your wishlist or view a few games to get recommendations."
                    listClassName="saved-horizontal-list"
                    stateClassName="saved-recommendations-state"
                    renderSkeleton={(index) => (
                        <div key={`rec-skeleton-${index}`} className="card saved-horizontal-card is-skeleton" />
                    )}
                    renderItem={(item) => (
                        <div key={item.game.id ?? item.game.title} className="card saved-horizontal-card">
                            <div className="saved-horizontal-cover">
                                <SafeGameImage src={item.game.imagePath} gameTitle={item.game.title} />
                            </div>
                            <div className="saved-horizontal-body">
                                <strong>{item.game.title}</strong>
                                <span className="saved-horizontal-price">
                                    ${Number(item.game.price).toFixed(2)}
                                </span>
                            </div>
                            <button type="button" className="btn btn-primary saved-horizontal-btn" disabled={!item.game.id}>
                                Add to cart
                            </button>
                        </div>
                    )}
                />
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
                <RecommendationsSection
                    items={viewedItems}
                    isLoading={isViewedLoading}
                    error={viewedError}
                    onRetry={reloadViewed}
                    emptyMessage="Browse a few games to see them here."
                    listClassName="saved-horizontal-list"
                    stateClassName="saved-recommendations-state"
                    renderSkeleton={(index) => (
                        <div key={`viewed-skeleton-${index}`} className="card saved-horizontal-card is-skeleton" />
                    )}
                    renderItem={(item) => (
                        <div key={item.game.id ?? item.game.title} className="card saved-horizontal-card">
                            <div className="saved-horizontal-cover">
                                <SafeGameImage src={item.game.imagePath} gameTitle={item.game.title} />
                            </div>
                            <div className="saved-horizontal-body">
                                <strong>{item.game.title}</strong>
                                <span className="saved-horizontal-subtitle">
                                    {new Date(item.lastViewedAt).toLocaleDateString()}
                                </span>
                                <span className="saved-horizontal-price">
                                    ${Number(item.game.price).toFixed(2)}
                                </span>
                            </div>
                            <button type="button" className="btn btn-primary saved-horizontal-btn" disabled={!item.game.id}>
                                Add to cart
                            </button>
                        </div>
                    )}
                />
            </section>
        </AccountShell>
    );
};

export default AccountSavedItemsPage;
