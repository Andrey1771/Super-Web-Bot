import React, { useEffect, useMemo, useRef, useState } from 'react';
import {Link} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
    faArrowLeft,
    faArrowRight,
    faChevronLeft,
    faChevronRight,
    faMagnifyingGlass
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import { useRecommendations } from '../../../hooks/use-recommendations';
import { useViewedGames } from '../../../hooks/use-viewed-games';
import { useGameKeys } from '../../../hooks/use-game-keys';
import RecommendationsSection from '../../../components/recommendations/recommendations-section';
import SafeGameImage from '../../../components/common/SafeGameImage';
import './account-keys-page.css';

const PAGE_SIZE = 4;

const AccountKeysPage: React.FC = () => {
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
    const {
        items: keyRows,
        isLoading: isKeysLoading,
        error: keysError,
        reload: reloadKeys
    } = useGameKeys(50);

    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState('Newest');
    const [typeFilter, setTypeFilter] = useState('All types');
    const [page, setPage] = useState(1);
    const recommendationsRowRef = useRef<HTMLDivElement>(null);
    const recentRowRef = useRef<HTMLDivElement>(null);

    // Доступные типы ключей формируем из реальных данных + базовые опции.
    const keyTypeOptions = useMemo(() => {
        const set = new Set<string>();
        keyRows.forEach((row) => {
            if (row.keyType) {
                set.add(row.keyType);
            }
        });
        return Array.from(set);
    }, [keyRows]);

    const filteredRows = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const rows = keyRows.filter((row) => {
            const title = (row.game?.title ?? row.game?.name ?? '').toLowerCase();
            const key = (row.key ?? '').toLowerCase();
            const matchesSearch = query === '' || title.includes(query) || key.includes(query);
            const matchesType = typeFilter === 'All types' || (row.keyType ?? '') === typeFilter;
            return matchesSearch && matchesType;
        });

        return rows.slice().sort((a, b) => {
            const aTime = a.issuedAt ? new Date(a.issuedAt).getTime() : 0;
            const bTime = b.issuedAt ? new Date(b.issuedAt).getTime() : 0;
            return sortOrder === 'Oldest' ? aTime - bTime : bTime - aTime;
        });
    }, [keyRows, searchQuery, typeFilter, sortOrder]);

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pagedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    // При смене фильтров возвращаемся на первую страницу.
    useEffect(() => {
        setPage(1);
    }, [searchQuery, typeFilter, sortOrder]);

    const hasActiveFilters = searchQuery !== '' || sortOrder !== 'Newest' || typeFilter !== 'All types';

    const paginationLabel = isKeysLoading
        ? 'Loading...'
        : keysError
            ? 'Unable to load keys'
            : filteredRows.length === 0
                ? (hasActiveFilters ? 'No keys match filters' : 'No keys yet')
                : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of ${filteredRows.length}`;

    const handleClearFilters = () => {
        setSearchQuery('');
        setSortOrder('Newest');
        setTypeFilter('All types');
        setPage(1);
    };

    const scrollRow = (ref: React.RefObject<HTMLDivElement>, direction: number) => {
        ref.current?.scrollBy({ left: direction * 320, behavior: 'smooth' });
    };

    const handleCopyKey = async (keyValue: string) => {
        if (!keyValue) {
            return;
        }

        try {
            await navigator.clipboard?.writeText(keyValue);
        } catch (error) {
            console.error('Failed to copy key:', error);
        }
    };

    return (
        <AccountShell
            title="My account"
            sectionLabel="Keys & activation"
            subtitle={(
                <div className="keys-header">
                    <h2 className="keys-title">Keys & activation</h2>
                    <div className="keys-description">
                        <p>Here you can view your purchased keys and activation details.</p>
                        <p>
                            Read our{' '}
                            <Link to="/support" className="keys-link">
                                activation guide
                            </Link>{' '}
                            for help.
                        </p>
                    </div>
                </div>
            )}
        >
            <div className="card keys-toolbar">
                <div className="keys-toolbar-row">
                    <div className="keys-search">
                        <FontAwesomeIcon icon={faMagnifyingGlass} />
                        <input
                            type="text"
                            placeholder="Search keys..."
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </div>
                    <div className="keys-filters">
                        <div className="keys-sort">
                            <span>Sort:</span>
                            <select
                                className="keys-select"
                                value={sortOrder}
                                onChange={(event) => setSortOrder(event.target.value)}
                            >
                                <option value="Newest">Newest</option>
                                <option value="Oldest">Oldest</option>
                            </select>
                        </div>
                        <select
                            className="keys-select"
                            value={typeFilter}
                            onChange={(event) => setTypeFilter(event.target.value)}
                        >
                            <option value="All types">All types</option>
                            {keyTypeOptions.map((type) => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="keys-toolbar-footer">
                    <button
                        type="button"
                        className="btn btn-outline keys-clear-btn"
                        onClick={handleClearFilters}
                        disabled={!hasActiveFilters}
                    >
                        Clear filters
                    </button>
                </div>
            </div>

            <div className="card keys-table-card">
                <div className="keys-table-wrapper">
                    <table className="keys-table">
                        <thead>
                            <tr>
                                <th>Game</th>
                                <th>Type</th>
                                <th>Date</th>
                                <th>Key / Activation</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isKeysLoading && (
                                <tr>
                                    <td colSpan={4} className="keys-table-state">
                                        Loading keys...
                                    </td>
                                </tr>
                            )}
                            {!isKeysLoading && keysError && (
                                <tr>
                                    <td colSpan={4} className="keys-table-state">
                                        <div className="keys-table-state-content">
                                            <span>{keysError}</span>
                                            <button type="button" className="btn btn-outline keys-copy-btn" onClick={reloadKeys}>
                                                Retry
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!isKeysLoading && !keysError && filteredRows.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="keys-table-state">
                                        {hasActiveFilters
                                            ? 'No keys match your filters.'
                                            : 'No keys yet. Complete a purchase to receive activation keys.'}
                                    </td>
                                </tr>
                            )}
                            {!isKeysLoading && !keysError && pagedRows.map((row, index) => {
                                const title = row.game?.title ?? row.game?.name ?? 'Unknown game';
                                const dateLabel = row.issuedAt ? new Date(row.issuedAt).toLocaleDateString() : 'Pending';
                                const keyType = row.keyType ?? 'Key';

                                return (
                                    <tr key={`${row.key}-${index}`}>
                                        <td>
                                            <div className="keys-game-cell">
                                                <div className="keys-game-cover" aria-hidden="true" />
                                                <span>{title}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="badge keys-type-badge">{keyType}</span>
                                        </td>
                                        <td>{dateLabel}</td>
                                        <td>
                                            {row.key ? (
                                                <div className="keys-key-actions">
                                                    <span className="keys-key-pill">{row.key}</span>
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline keys-copy-btn"
                                                        onClick={() => handleCopyKey(row.key)}
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                            ) : (
                                                <button type="button" className="btn btn-outline keys-activation-btn">
                                                    Go to activation
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="keys-pagination">
                <div className="keys-pagination-controls">
                    <button
                        type="button"
                        className="btn btn-outline keys-page-btn"
                        aria-label="Previous page"
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentPage <= 1}
                    >
                        <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNumber) => (
                        <button
                            key={pageNumber}
                            type="button"
                            className={`btn btn-outline keys-page-btn ${pageNumber === currentPage ? 'is-active' : ''}`}
                            onClick={() => setPage(pageNumber)}
                        >
                            {pageNumber}
                        </button>
                    ))}
                    <button
                        type="button"
                        className="btn btn-outline keys-page-btn"
                        aria-label="Next page"
                        onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={currentPage >= totalPages}
                    >
                        <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                </div>
                <span className="keys-pagination-note">{paginationLabel}</span>
            </div>

            <section className="keys-recommendations">
                <div className="keys-section-header">
                    <h3>Recommendations based on your wishlist</h3>
                    <div className="keys-section-arrows">
                        <button type="button" className="btn btn-outline keys-arrow-btn" aria-label="Scroll left" onClick={() => scrollRow(recommendationsRowRef, -1)}>
                            <FontAwesomeIcon icon={faArrowLeft} />
                        </button>
                        <button type="button" className="btn btn-outline keys-arrow-btn" aria-label="Scroll right" onClick={() => scrollRow(recommendationsRowRef, 1)}>
                            <FontAwesomeIcon icon={faArrowRight} />
                        </button>
                    </div>
                </div>
                <div ref={recommendationsRowRef} className="keys-scroll-row" style={{ overflowX: 'auto' }}>
                    <RecommendationsSection
                        items={recommendations}
                        isLoading={isRecommendationsLoading}
                        error={recommendationsError}
                        onRetry={reloadRecommendations}
                        emptyMessage="Add games to your wishlist or view a few games to get recommendations."
                        listClassName="keys-card-grid"
                        stateClassName="keys-recommendations-state"
                        renderSkeleton={(index) => (
                            <div key={`rec-skeleton-${index}`} className="card keys-card is-skeleton" />
                        )}
                        renderItem={(item) => (
                            <div key={item.game.id ?? item.game.title} className="card keys-card">
                                <div className="keys-card-media">
                                    <SafeGameImage src={item.game.imagePath} gameTitle={item.game.title} />
                                </div>
                                <div className="keys-card-body">
                                    <strong>{item.game.title}</strong>
                                    <span className="keys-card-price">${Number(item.game.price).toFixed(2)}</span>
                                </div>
                                <button type="button" className="btn btn-primary keys-card-btn" disabled={!item.game.id}>
                                    Add to cart
                                </button>
                            </div>
                        )}
                    />
                </div>
            </section>

            <section className="keys-recent">
                <div className="keys-section-header">
                    <h3>Recently viewed</h3>
                    <div className="keys-section-arrows">
                        <button type="button" className="btn btn-outline keys-arrow-btn" aria-label="Scroll left" onClick={() => scrollRow(recentRowRef, -1)}>
                            <FontAwesomeIcon icon={faArrowLeft} />
                        </button>
                        <button type="button" className="btn btn-outline keys-arrow-btn" aria-label="Scroll right" onClick={() => scrollRow(recentRowRef, 1)}>
                            <FontAwesomeIcon icon={faArrowRight} />
                        </button>
                    </div>
                </div>
                <div ref={recentRowRef} className="keys-scroll-row" style={{ overflowX: 'auto' }}>
                    <RecommendationsSection
                        items={viewedItems}
                        isLoading={isViewedLoading}
                        error={viewedError}
                        onRetry={reloadViewed}
                        emptyMessage="Browse a few games to see them here."
                        listClassName="keys-card-grid keys-card-grid--recent"
                        stateClassName="keys-recommendations-state"
                        renderSkeleton={(index) => (
                            <div key={`viewed-skeleton-${index}`} className="card keys-card is-skeleton" />
                        )}
                        renderItem={(item) => (
                            <div key={item.game.id ?? item.game.title} className="card keys-card">
                                <div className="keys-card-media keys-card-media--wide">
                                    <SafeGameImage src={item.game.imagePath} gameTitle={item.game.title} />
                                </div>
                                <div className="keys-card-body">
                                    <strong>{item.game.title}</strong>
                                    <span className="keys-card-date">
                                        {new Date(item.lastViewedAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <button type="button" className="btn btn-primary keys-card-btn" disabled={!item.game.id}>
                                    Add to cart
                                </button>
                            </div>
                        )}
                    />
                </div>
            </section>
        </AccountShell>
    );
};

export default AccountKeysPage;
