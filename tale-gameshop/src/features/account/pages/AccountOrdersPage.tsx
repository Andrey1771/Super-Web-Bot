import React, {useMemo} from 'react';
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
import { useRecommendations } from '../../../hooks/use-recommendations';
import { useOrders } from '../../../hooks/use-orders';
import RecommendationsSection from '../../../components/recommendations/recommendations-section';
import './account-orders-page.css';
import type { Order } from '../../../models/order';

const formatCurrency = (value: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency
    }).format(value);
};

const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat('en-US', {month: 'long', day: 'numeric', year: 'numeric'}).format(date);
};

const getStatusMeta = (order: Order) => {
    const isCompleted = order.status === 'Completed' || (order.isPaid && order.isFulfilled);
    return {
        label: order.status || (order.isPaid ? 'Completed' : 'Payment pending'),
        className: isCompleted ? 'status-completed' : 'status-processing',
        isCompleted
    };
};

const AccountOrdersPage: React.FC = () => {
    const {
        items: recommendations,
        isLoading: isRecommendationsLoading,
        error: recommendationsError,
        reload: reloadRecommendations
    } = useRecommendations(6);
    const {
        items: orders,
        totalCount,
        isLoading: isOrdersLoading,
        error: ordersError,
        reload: reloadOrders
    } = useOrders(null);

    const ordersTitle = useMemo(() => {
        if (isOrdersLoading) {
            return 'Orders';
        }
        return `Orders (${totalCount})`;
    }, [isOrdersLoading, totalCount]);

    const ordersSubtitle = useMemo(() => {
        if (isOrdersLoading) {
            return 'Loading your orders...';
        }
        if (ordersError) {
            return 'Unable to load orders right now.';
        }
        if (totalCount === 0) {
            return 'No orders yet';
        }
        return `Showing 1-${orders.length} of ${totalCount}`;
    }, [isOrdersLoading, ordersError, orders.length, totalCount]);

    return (
        <AccountShell
            title="My account"
            sectionLabel="Orders"
            subtitle={<h2 className="orders-title">{ordersTitle}</h2>}
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
                    <span>{ordersSubtitle}</span>
                </div>
            </div>

            <div className="orders-list">
                {isOrdersLoading && (
                    <div className="card orders-state">Loading your orders…</div>
                )}
                {!isOrdersLoading && ordersError && (
                    <div className="card orders-state orders-state-error">
                        <span>{ordersError}</span>
                        <button type="button" className="btn btn-outline" onClick={reloadOrders}>
                            Try again
                        </button>
                    </div>
                )}
                {!isOrdersLoading && !ordersError && orders.length === 0 && (
                    <div className="card orders-state">Your orders will appear here after checkout.</div>
                )}
                {!isOrdersLoading && !ordersError && orders.map((order) => {
                    const statusMeta = getStatusMeta(order);
                    const orderItems = [order.gameName ? `1 × ${order.gameName}` : '1 × Game'];
                    const amount = formatCurrency(order.totalAmount ?? 0, order.currency ?? 'USD');
                    const viewLabel = order.isPaid ? 'View keys' : 'Awaiting payment';

                    return (
                        <div key={order.id} className="card order-card">
                            <div className="order-card-header">
                                <span className="order-date">{formatDate(order.orderDate)}</span>
                                <span className="order-amount">{amount}</span>
                            </div>
                            <div className="order-card-body">
                                <div className="order-cover" aria-hidden="true" />
                                <div className="order-details">
                                    <strong>Order #{order.id}</strong>
                                    <div className="order-items">
                                        {orderItems.map((item) => (
                                            <span key={item}>{item}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="order-actions">
                                    <span className={`badge order-status ${statusMeta.className}`}>
                                        {statusMeta.label}
                                    </span>
                                    <button
                                        type="button"
                                        className="btn btn-primary order-action-btn"
                                        disabled={!order.isPaid}
                                    >
                                        {viewLabel}
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
                <span className="orders-pagination-note">{ordersSubtitle}</span>
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
                <RecommendationsSection
                    items={recommendations}
                    isLoading={isRecommendationsLoading}
                    error={recommendationsError}
                    onRetry={reloadRecommendations}
                    emptyMessage="Add games to your wishlist or view a few games to get recommendations."
                    listClassName="orders-recommendations-list"
                    stateClassName="orders-recommendations-state"
                    renderSkeleton={(index) => (
                        <div key={`rec-skeleton-${index}`} className="card orders-recommendation-card is-skeleton" />
                    )}
                    renderItem={(item) => (
                        <div key={item.game.id ?? item.game.title} className="card orders-recommendation-card">
                            <div className="orders-recommendation-media">
                                {item.game.imagePath ? (
                                    <img src={item.game.imagePath} alt={item.game.title} />
                                ) : (
                                    <div className="orders-recommendation-fallback" aria-hidden="true" />
                                )}
                            </div>
                            <div className="orders-recommendation-body">
                                <strong>{item.game.title}</strong>
                                <span className="orders-recommendation-price">
                                    ${Number(item.game.price).toFixed(2)}
                                </span>
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary orders-recommendation-btn"
                                disabled={!item.game.id}
                            >
                                Add to cart
                            </button>
                        </div>
                    )}
                />
            </section>
        </AccountShell>
    );
};

export default AccountOrdersPage;
