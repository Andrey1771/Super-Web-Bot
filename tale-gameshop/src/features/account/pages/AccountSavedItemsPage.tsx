import React from 'react';
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
import './account-saved-items-page.css';

type SavedItem = {
    id: string;
    title: string;
    date: string;
    price: string;
    oldPrice?: string;
    badge?: {label: string; variant: 'new' | 'sale'};
    coverClass: string;
};

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

const savedItems: SavedItem[] = [
    {
        id: 'saved-1',
        title: 'Hades II',
        date: 'April 15, 2024',
        price: '$29.99',
        badge: {label: 'New', variant: 'new'},
        coverClass: 'saved-cover-hades'
    },
    {
        id: 'saved-2',
        title: 'Elden Ring',
        date: 'April 15, 2024',
        price: '$59.99',
        coverClass: 'saved-cover-elden'
    },
    {
        id: 'saved-3',
        title: 'Hogwarts Legacy',
        date: 'March 21, 2024',
        price: '$39.99',
        oldPrice: '$59.99',
        badge: {label: 'Sale: 26%', variant: 'sale'},
        coverClass: 'saved-cover-hogwarts'
    },
    {
        id: 'saved-4',
        title: 'Remnant II',
        date: 'July 28, 2023',
        price: '$49.99',
        coverClass: 'saved-cover-remnant'
    },
    {
        id: 'saved-5',
        title: 'Control',
        date: 'Ultimate Edition',
        price: '$14.99',
        oldPrice: '$59.99',
        coverClass: 'saved-cover-control'
    },
    {
        id: 'saved-6',
        title: 'Sekiro',
        date: 'December 10, 2023',
        price: '$59.99',
        coverClass: 'saved-cover-sekiro'
    }
];

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

const SavedItemCardComfortable: React.FC<{item: SavedItem; showShortcut?: boolean}> = ({
    item,
    showShortcut
}) => (
    <div className="card saved-item-card">
        <div className={`saved-item-cover ${item.coverClass}`} aria-hidden="true">
            {item.badge && (
                <span className={`badge saved-badge saved-badge-${item.badge.variant}`}>
                    {item.badge.label}
                </span>
            )}
        </div>
        <div className="saved-item-body">
            <div className="saved-item-title-row">
                <div>
                    <h3>{item.title}</h3>
                    <p className="saved-item-date">{item.date}</p>
                </div>
                <div className="saved-item-price">
                    {item.oldPrice && <span className="saved-item-old-price">{item.oldPrice}</span>}
                    <span>{item.price}</span>
                </div>
            </div>
            <div className="saved-item-actions">
                <button type="button" className="btn btn-primary saved-item-btn">
                    Add to cart
                </button>
                <button type="button" className="btn btn-outline saved-item-btn">
                    Remove
                </button>
                {showShortcut && (
                    <button type="button" className="btn btn-outline saved-item-icon-btn" aria-label="Open item">
                        <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                )}
            </div>
        </div>
    </div>
);

const SavedItemCardCompact: React.FC<{item: SavedItem}> = ({item}) => (
    <div className="card saved-item-card compact">
        <div className={`saved-item-compact-cover ${item.coverClass}`} aria-hidden="true" />
        <div className="saved-item-compact-body">
            <div className="saved-item-compact-header">
                <div>
                    <strong>{item.title}</strong>
                    <span className="saved-item-date">{item.date}</span>
                </div>
                <div className="saved-item-price">
                    {item.oldPrice && <span className="saved-item-old-price">{item.oldPrice}</span>}
                    <span>{item.price}</span>
                </div>
            </div>
            <div className="saved-item-compact-badges">
                {item.badge && (
                    <span className={`badge saved-badge saved-badge-${item.badge.variant}`}>
                        {item.badge.label}
                    </span>
                )}
            </div>
            <div className="saved-item-actions">
                <button type="button" className="btn btn-primary saved-item-btn">
                    Add to cart
                </button>
                <button type="button" className="btn btn-outline saved-item-btn">
                    Remove
                </button>
            </div>
        </div>
    </div>
);

const AccountSavedItemsPage: React.FC = () => {
    const viewMode: 'comfortable' | 'compact' = 'comfortable';

    return (
        <AccountShell
            title="Saved items (48)"
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
                    <span className="saved-toolbar-note">Showing 1-9 of 48</span>
                </div>
            </div>

            <div className="card saved-items-panel" data-testid="saved-grid">
                <div className={`saved-items-grid view-${viewMode}`}>
                    {viewMode === 'comfortable'
                        ? savedItems.map((item, index) => (
                            <SavedItemCardComfortable
                                key={item.id}
                                item={item}
                                showShortcut={index === 2}
                            />
                        ))
                        : savedItems.map((item) => (
                            <SavedItemCardCompact key={item.id} item={item} />
                        ))}
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
                <span className="saved-pagination-note">Showing 1-9 of 48</span>
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
