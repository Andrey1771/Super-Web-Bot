import React from 'react';
import {Link} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
    faChevronLeft,
    faChevronRight,
    faFileInvoice,
    faMagnifyingGlass,
    faArrowLeft,
    faArrowRight
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import './account-orders-page.css';

const orders = [
    {
        id: '121021',
        date: 'April 5, 2024',
        amount: '$29.99',
        status: 'Processing',
        items: ['1 × Hades II'],
        viewLabel: 'View key'
    },
    {
        id: '121020',
        date: 'March 28, 2024',
        amount: '$64.50',
        status: 'Completed',
        items: ['1 × Hollow Knight: Silksong', '1 × Sea of Stars'],
        viewLabel: 'View keys'
    },
    {
        id: '121019',
        date: 'March 14, 2024',
        amount: '$18.00',
        status: 'Completed',
        items: ['1 × Balatro'],
        viewLabel: 'View key'
    },
    {
        id: '121018',
        date: 'February 22, 2024',
        amount: '$42.40',
        status: 'Completed',
        items: ['1 × Pacific Drive'],
        viewLabel: 'View key'
    }
];

const recommendations = [
    {id: 'rec-1', title: 'Moonlighter 2', price: '$19.99'},
    {id: 'rec-2', title: 'Prince of Persia: The Lost Crown', price: '$29.99'},
    {id: 'rec-3', title: 'Sable', price: '$14.99'},
    {id: 'rec-4', title: 'Chants of Sennaar', price: '$17.50'}
];

const AccountOrdersPage: React.FC = () => {
    return (
        <AccountShell
            title="My account"
            sectionLabel="Orders"
            subtitle={<h2 className="orders-title">Orders (12)</h2>}
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
            <div className="card orders-toolbar">
                <div className="orders-toolbar-top">
                    <div className="orders-search">
                        <FontAwesomeIcon icon={faMagnifyingGlass} className="orders-search-icon" />
                        <input type="text" placeholder="Search in orders..." />
                    </div>
                </div>
                <div className="orders-toolbar-row">
                    <div className="orders-sort">
                        <span>Sort:</span>
                        <select className="orders-select" defaultValue="Newest">
                            <option>Newest</option>
                            <option>Oldest</option>
                            <option>Highest price</option>
                        </select>
                    </div>
                    <div className="orders-status">
                        <button type="button" className="btn btn-outline orders-status-btn">
                            All
                        </button>
                        <button type="button" className="btn btn-outline orders-status-btn is-active">
                            Completed
                        </button>
                        <button type="button" className="btn btn-outline orders-status-btn">
                            Refunded
                        </button>
                    </div>
                </div>
                <div className="orders-toolbar-footer">
                    <span>Showing 1-4 of 12</span>
                </div>
            </div>

            <div className="orders-list">
                {orders.map((order) => {
                    const isProcessing = order.status === 'Processing';

                    return (
                        <div key={order.id} className="card order-card">
                            <div className="order-card-header">
                                <span className="order-date">{order.date}</span>
                                <span className="order-amount">{order.amount}</span>
                            </div>
                            <div className="order-card-body">
                                <div className="order-cover" aria-hidden="true" />
                                <div className="order-details">
                                    <strong>Order #{order.id}</strong>
                                    <div className="order-items">
                                        {order.items.map((item) => (
                                            <span key={item}>{item}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="order-actions">
                                    <span
                                        className={`badge order-status ${
                                            isProcessing ? 'status-processing' : 'status-completed'
                                        }`}
                                    >
                                        {order.status}
                                    </span>
                                    <button
                                        type="button"
                                        className="btn btn-primary order-action-btn"
                                        disabled={isProcessing}
                                    >
                                        {order.viewLabel}
                                    </button>
                                    <button type="button" className="btn btn-outline order-action-btn">
                                        <FontAwesomeIcon icon={faFileInvoice} />
                                        Invoice
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="orders-pagination">
                <div className="orders-pagination-controls">
                    <button type="button" className="btn btn-outline orders-page-btn" aria-label="Previous page">
                        <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    <button type="button" className="btn btn-outline orders-page-btn is-active">
                        1
                    </button>
                    <button type="button" className="btn btn-outline orders-page-btn">
                        2
                    </button>
                    <button type="button" className="btn btn-outline orders-page-btn">
                        3
                    </button>
                    <span className="orders-page-ellipsis">…</span>
                    <button type="button" className="btn btn-outline orders-page-btn">
                        6
                    </button>
                    <button type="button" className="btn btn-outline orders-page-btn" aria-label="Next page">
                        <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                </div>
                <span className="orders-pagination-note">Showing 1-4 of 12</span>
            </div>

            <section className="orders-recommendations">
                <div className="orders-recommendations-header">
                    <h3>Recommendations based on your wishlist</h3>
                    <div className="orders-recommendations-arrows">
                        <button type="button" className="btn btn-outline orders-arrow-btn" aria-label="Scroll left">
                            <FontAwesomeIcon icon={faArrowLeft} />
                        </button>
                        <button type="button" className="btn btn-outline orders-arrow-btn" aria-label="Scroll right">
                            <FontAwesomeIcon icon={faArrowRight} />
                        </button>
                    </div>
                </div>
                <div className="orders-recommendations-list">
                    {recommendations.map((item) => (
                        <div key={item.id} className="card orders-recommendation-card">
                            <div className="orders-recommendation-media" aria-hidden="true" />
                            <div className="orders-recommendation-body">
                                <strong>{item.title}</strong>
                                <span className="orders-recommendation-price">{item.price}</span>
                            </div>
                            <button type="button" className="btn btn-primary orders-recommendation-btn">
                                Add to cart
                            </button>
                        </div>
                    ))}
                </div>
            </section>
        </AccountShell>
    );
};

export default AccountOrdersPage;
