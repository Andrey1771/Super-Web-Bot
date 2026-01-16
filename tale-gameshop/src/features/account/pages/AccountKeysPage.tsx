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
import './account-keys-page.css';

const keyRows = [
    {
        id: 'key-1',
        game: 'Elden Ring',
        type: 'CD Key',
        date: 'April 15, 2024',
        key: 'XXXX-XXXX-XX…'
    },
    {
        id: 'key-2',
        game: 'Hades II',
        type: 'CD Key',
        date: 'April 5, 2024',
        key: 'XXXX-XXXX-XX…'
    },
    {
        id: 'key-3',
        game: 'Hades II',
        type: 'CD Key',
        date: 'March 28, 2023',
        key: 'XXXX-XXXX-XX…'
    },
    {
        id: 'key-4',
        game: 'Cyberpunk 2077',
        type: 'Activation',
        date: 'March 22, 2024'
    }
];

const recommendations = [
    {id: 'rec-1', title: 'Dying Light 2', price: '$19.99'},
    {id: 'rec-2', title: 'Dark Souls', price: '$59.99'},
    {id: 'rec-3', title: 'The Witcher 3', price: '$29.99'},
    {id: 'rec-4', title: 'God of War', price: '$49.99'}
];

const recentlyViewed = [
    {id: 'recent-1', title: 'Baldur\'s Gate 3', date: 'March 25, 2023'},
    {id: 'recent-2', title: 'Elden Ring', date: 'Recomn Ding'},
    {id: 'recent-3', title: 'Resident Evil', date: 'Assisted in Vintage'},
    {id: 'recent-4', title: 'Lies of P', date: 'B832a 225'}
];

const AccountKeysPage: React.FC = () => {
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
                            {keyRows.map((row) => (
                                <tr key={row.id}>
                                    <td>
                                        <div className="keys-game-cell">
                                            <div className="keys-game-cover" aria-hidden="true" />
                                            <span>{row.game}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="badge keys-type-badge">{row.type}</span>
                                    </td>
                                    <td>{row.date}</td>
                                    <td>
                                        {row.type === 'Activation' ? (
                                            <button type="button" className="btn btn-outline keys-activation-btn">
                                                Go to activation
                                            </button>
                                        ) : (
                                            <div className="keys-key-actions">
                                                <span className="keys-key-pill">{row.key}</span>
                                                <button type="button" className="btn btn-outline keys-copy-btn">
                                                    Copy
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
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
                <span className="keys-pagination-note">Showing 1-4 of 42</span>
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
                <div className="keys-card-grid">
                    {recommendations.map((item) => (
                        <div key={item.id} className="card keys-card">
                            <div className="keys-card-media" aria-hidden="true" />
                            <div className="keys-card-body">
                                <strong>{item.title}</strong>
                                <span className="keys-card-price">{item.price}</span>
                            </div>
                            <button type="button" className="btn btn-primary keys-card-btn">
                                Add to cart
                            </button>
                        </div>
                    ))}
                </div>
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
                <div className="keys-card-grid keys-card-grid--recent">
                    {recentlyViewed.map((item) => (
                        <div key={item.id} className="card keys-card">
                            <div className="keys-card-media keys-card-media--wide" aria-hidden="true" />
                            <div className="keys-card-body">
                                <strong>{item.title}</strong>
                                <span className="keys-card-date">{item.date}</span>
                            </div>
                            <button type="button" className="btn btn-primary keys-card-btn">
                                Add to cart
                            </button>
                        </div>
                    ))}
                </div>
            </section>
        </AccountShell>
    );
};

export default AccountKeysPage;
