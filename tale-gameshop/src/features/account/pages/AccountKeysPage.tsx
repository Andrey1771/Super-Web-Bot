import React from 'react';
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
import './account-keys-page.css';

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
    const paginationLabel = isKeysLoading
        ? 'Loading...'
        : keysError
            ? 'Unable to load keys'
            : keyRows.length === 0
                ? 'No keys yet'
                : `Showing 1-${Math.min(keyRows.length, 4)} of ${keyRows.length}`;

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
                            <a href="#" className="keys-link">
                                activation guide
                            </a>{' '}
                            for help.
                        </p>
                    </div>
                </div>
            )}
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
            <div className="card keys-toolbar">
                <div className="keys-toolbar-row">
                    <div className="keys-search">
                        <FontAwesomeIcon icon={faMagnifyingGlass} />
                        <input type="text" placeholder="Search keys..." />
                    </div>
                    <div className="keys-filters">
                        <div className="keys-sort">
                            <span>Sort:</span>
                            <select className="keys-select" defaultValue="Newest">
                                <option>Newest</option>
                                <option>Oldest</option>
                                <option>Recently activated</option>
                            </select>
                        </div>
                        <select className="keys-select" defaultValue="All types">
                            <option>All types</option>
                            <option>CD Key</option>
                            <option>Activation</option>
                        </select>
                    </div>
                </div>
                <div className="keys-toolbar-footer">
                    <button type="button" className="btn btn-outline keys-clear-btn">
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
                            {!isKeysLoading && !keysError && keyRows.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="keys-table-state">
                                        No keys yet. Complete a purchase to receive activation keys.
                                    </td>
                                </tr>
                            )}
                            {!isKeysLoading && !keysError && keyRows.map((row, index) => {
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
                    <button type="button" className="btn btn-outline keys-page-btn" aria-label="Previous page">
                        <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    <button type="button" className="btn btn-outline keys-page-btn is-active">
                        1
                    </button>
                    <button type="button" className="btn btn-outline keys-page-btn">
                        2
                    </button>
                    <button type="button" className="btn btn-outline keys-page-btn">
                        3
                    </button>
                    <button type="button" className="btn btn-outline keys-page-btn" aria-label="Next page">
                        <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                </div>
                <span className="keys-pagination-note">{paginationLabel}</span>
            </div>

            <section className="keys-recommendations">
                <div className="keys-section-header">
                    <h3>Recommendations based on your wishlist</h3>
                    <div className="keys-section-arrows">
                        <button type="button" className="btn btn-outline keys-arrow-btn" aria-label="Scroll left">
                            <FontAwesomeIcon icon={faArrowLeft} />
                        </button>
                        <button type="button" className="btn btn-outline keys-arrow-btn" aria-label="Scroll right">
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
                    listClassName="keys-card-grid"
                    stateClassName="keys-recommendations-state"
                    renderSkeleton={(index) => (
                        <div key={`rec-skeleton-${index}`} className="card keys-card is-skeleton" />
                    )}
                    renderItem={(item) => (
                        <div key={item.game.id ?? item.game.title} className="card keys-card">
                            <div className="keys-card-media">
                                {item.game.imagePath ? (
                                    <img src={item.game.imagePath} alt={item.game.title} />
                                ) : (
                                    <div className="keys-card-fallback" aria-hidden="true" />
                                )}
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
            </section>

            <section className="keys-recent">
                <div className="keys-section-header">
                    <h3>Recently viewed</h3>
                    <div className="keys-section-arrows">
                        <button type="button" className="btn btn-outline keys-arrow-btn" aria-label="Scroll left">
                            <FontAwesomeIcon icon={faArrowLeft} />
                        </button>
                        <button type="button" className="btn btn-outline keys-arrow-btn" aria-label="Scroll right">
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
                    listClassName="keys-card-grid keys-card-grid--recent"
                    stateClassName="keys-recommendations-state"
                    renderSkeleton={(index) => (
                        <div key={`viewed-skeleton-${index}`} className="card keys-card is-skeleton" />
                    )}
                    renderItem={(item) => (
                        <div key={item.game.id ?? item.game.title} className="card keys-card">
                            <div className="keys-card-media keys-card-media--wide">
                                {item.game.imagePath ? (
                                    <img src={item.game.imagePath} alt={item.game.title} />
                                ) : (
                                    <div className="keys-card-fallback" aria-hidden="true" />
                                )}
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
            </section>
        </AccountShell>
    );
};

export default AccountKeysPage;
