import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronLeft,
  faChevronRight,
  faMagnifyingGlass,
  faArrowLeft,
  faArrowRight,
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import { useRecommendations } from '../../../hooks/use-recommendations';
import { useOrders } from '../../../hooks/use-orders';
import useDebouncedValue from '../../../hooks/useDebouncedValue';
import RecommendationsSection from '../../../components/recommendations/recommendations-section';
import { fetchAccountOrderDetails } from '../../../api/accountApi';
import type { AccountOrderDetails, AccountOrderListItem } from '../../../types/account-orders';
import './account-orders-page.css';

const PAGE_SIZE = 10;

type StatusFilter = 'all' | 'completed' | 'refunded' | 'pending' | 'failed';
type SortOption = 'newest' | 'oldest' | 'total_desc' | 'total_asc';

const formatCurrency = (value: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);
};

const toStatusMeta = (status: string) => {
  const normalized = status.toUpperCase();
  if (normalized === 'DELIVERED') {
    return { label: 'Completed', className: 'status-completed' };
  }
  if (normalized === 'REFUNDED') {
    return { label: 'Refunded', className: 'status-refunded' };
  }
  if (normalized === 'FAILED') {
    return { label: 'Failed', className: 'status-failed' };
  }
  if (normalized === 'PENDING') {
    return { label: 'Pending', className: 'status-processing' };
  }

  return { label: 'Processing', className: 'status-processing' };
};

const buildPages = (current: number, total: number) => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  if (current <= 3) {
    return [1, 2, 3, 4, 'ellipsis', total - 1, total] as const;
  }

  if (current >= total - 2) {
    return [1, 2, 'ellipsis', total - 3, total - 2, total - 1, total] as const;
  }

  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total] as const;
};

const OrderCard: React.FC<{ order: AccountOrderListItem }> = ({ order }) => {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<AccountOrderDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const statusMeta = toStatusMeta(order.status);

  const previewText = order.itemsCount <= 1
    ? `${order.itemsCount || 0} item • ${order.preview.firstTitle || 'Game purchase'}`
    : `${order.itemsCount} items • ${order.preview.firstTitle || 'Game purchase'} +${order.preview.extraCount}`;

  const handleToggle = async () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);

    if (!nextExpanded || details || loadingDetails) {
      return;
    }

    setLoadingDetails(true);
    setDetailsError(null);
    try {
      const response = await fetchAccountOrderDetails(order.internalId);
      setDetails(response);
    } catch (error) {
      console.error('Failed to load order details:', error);
      setDetailsError('Unable to load order details.');
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <div className="card order-card">
      <div className="order-card-header">
        <span className="order-date">{formatDate(order.createdAt)}</span>
        <span className="order-amount">{formatCurrency(order.totalAmount, order.currency)}</span>
      </div>
      <div className="order-card-body">
        <div className="order-cover" aria-hidden="true">
          {order.preview.firstCoverUrl ? <img src={order.preview.firstCoverUrl} alt="" /> : null}
        </div>
        <div className="order-details">
          <strong>Order #{order.orderId}</strong>
          <div className="order-items">
            <span>{previewText}</span>
          </div>
        </div>
        <div className="order-actions">
          <span className={`badge order-status ${statusMeta.className}`}>{statusMeta.label}</span>
          <button type="button" className="btn btn-outline order-action-btn" onClick={handleToggle}>
            {expanded ? 'Hide details' : 'View details'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="order-details-panel">
          {loadingDetails && <div className="order-details-state">Loading order details...</div>}
          {!loadingDetails && detailsError && <div className="order-details-state order-details-error">{detailsError}</div>}
          {!loadingDetails && !detailsError && details?.legacyDetailsUnavailable && (
            <div className="order-details-state">Legacy order (details unavailable).</div>
          )}
          {!loadingDetails && !detailsError && details && !details.legacyDetailsUnavailable && (
            <>
              <div className="order-line-items">
                {details.items.map((item) => (
                  <div key={item.itemId} className="order-line-item">
                    <div className="order-line-cover">
                      {item.coverUrl ? <img src={item.coverUrl} alt={item.title} /> : <div className="order-line-cover-fallback" />}
                    </div>
                    <div className="order-line-main">
                      <strong>{item.title}</strong>
                      <div className="order-line-meta">
                        <span>Qty: {item.quantity}</span>
                        <span>{formatCurrency(item.finalUnitPrice, item.currency)} each</span>
                        {item.platform ? <span>{item.platform}</span> : null}
                        {item.region ? <span>{item.region}</span> : null}
                        {item.gameId && <Link to={`/games/${item.gameId}`} className="order-line-link">View game</Link>}
                      </div>
                      {item.keys.length > 0 && (
                        <div className="order-line-keys">
                          <strong>Keys:</strong>
                          {item.keys.map((key) => <span key={key}>{key}</span>)}
                        </div>
                      )}
                    </div>
                    <div className="order-line-total">{formatCurrency(item.lineTotal, item.currency)}</div>
                  </div>
                ))}
              </div>
              <div className="order-totals">
                <div><span>Subtotal</span><strong>{formatCurrency(details.totals.subtotal, details.currency)}</strong></div>
                <div><span>Discount</span><strong>-{formatCurrency(details.totals.discountTotal, details.currency)}</strong></div>
                <div><span>Tax</span><strong>{formatCurrency(details.totals.taxTotal, details.currency)}</strong></div>
                <div className="order-totals-grand"><span>Total</span><strong>{formatCurrency(details.totals.total, details.currency)}</strong></div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const AccountOrdersPage: React.FC = () => {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortOption>('newest');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  const {
    items: recommendations,
    isLoading: isRecommendationsLoading,
    error: recommendationsError,
    reload: reloadRecommendations,
  } = useRecommendations(6);

  const {
    items: orders,
    totalCount,
    totalPages,
    isLoading: isOrdersLoading,
    error: ordersError,
    reload: reloadOrders,
  } = useOrders({
    page,
    pageSize: PAGE_SIZE,
    status,
    q: debouncedSearch,
    sort,
  });

  const ordersTitle = isOrdersLoading ? 'Orders' : `Orders (${totalCount})`;
  const from = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = totalCount === 0 ? 0 : Math.min(page * PAGE_SIZE, totalCount);
  const ordersSubtitle = isOrdersLoading
    ? 'Loading your orders...'
    : ordersError
      ? 'Unable to load orders right now.'
      : totalCount === 0
        ? 'No orders yet'
        : `Showing ${from}-${to} of ${totalCount}`;

  const pages = useMemo(() => buildPages(page, totalPages), [page, totalPages]);

  const applyStatus = (nextStatus: StatusFilter) => {
    setStatus(nextStatus);
    setPage(1);
  };

  const applySort = (nextSort: SortOption) => {
    setSort(nextSort);
    setPage(1);
  };

  const onSearchChange = (value: string) => {
    setSearchInput(value);
    setPage(1);
  };

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
            <input
              type="search"
              placeholder="Search in orders..."
              value={searchInput}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
        </div>
        <div className="orders-toolbar-row">
          <div className="orders-sort">
            <span>Sort:</span>
            <select className="orders-select" value={sort} onChange={(event) => applySort(event.target.value as SortOption)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="total_desc">Highest price</option>
              <option value="total_asc">Lowest price</option>
            </select>
          </div>
          <div className="orders-status" role="tablist" aria-label="Order status filter">
            {([
              ['all', 'All'],
              ['completed', 'Completed'],
              ['refunded', 'Refunded'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={status === value}
                className={`btn btn-outline orders-status-btn ${status === value ? 'is-active' : ''}`}
                onClick={() => applyStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="orders-toolbar-footer">
          <span>{ordersSubtitle}</span>
        </div>
      </div>

      <div className="orders-list">
        {isOrdersLoading && Array.from({ length: 3 }, (_, index) => (
          <div key={`orders-skeleton-${index}`} className="card orders-state orders-state-skeleton">Loading order...</div>
        ))}
        {!isOrdersLoading && ordersError && (
          <div className="card orders-state orders-state-error">
            <span>{ordersError}</span>
            <button type="button" className="btn btn-outline" onClick={reloadOrders}>
              Try again
            </button>
          </div>
        )}
        {!isOrdersLoading && !ordersError && orders.length === 0 && (
          <div className="card orders-state">No orders yet.</div>
        )}
        {!isOrdersLoading && !ordersError && orders.map((order) => <OrderCard key={order.internalId} order={order} />)}
      </div>

      <div className="orders-pagination">
        <div className="orders-pagination-controls">
          <button
            type="button"
            className="btn btn-outline orders-page-btn"
            aria-label="Previous page"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={isOrdersLoading || page <= 1}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          {pages.map((item, index) =>
            item === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="orders-page-ellipsis">…</span>
            ) : (
              <button
                key={item}
                type="button"
                className={`btn btn-outline orders-page-btn ${item === page ? 'is-active' : ''}`}
                onClick={() => setPage(item)}
                disabled={isOrdersLoading}
              >
                {item}
              </button>
            ))}
          <button
            type="button"
            className="btn btn-outline orders-page-btn"
            aria-label="Next page"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={isOrdersLoading || totalPages === 0 || page >= totalPages}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      </div>

      <RecommendationsSection
        title="Need more game keys?"
        items={recommendations}
        isLoading={isRecommendationsLoading}
        error={recommendationsError}
        onRetry={reloadRecommendations}
        emptyText="Recommendations are currently unavailable."
        variant="compact"
        action={
          <Link to="/catalog" className="btn btn-outline recommendations-action-btn">
            Browse catalog
          </Link>
        }
      />

      <div className="orders-navigation card">
        <Link to="/account/overview" className="orders-nav-link">
          <FontAwesomeIcon icon={faArrowLeft} />
          Back to account overview
        </Link>
        <Link to="/wishlist" className="orders-nav-link">
          Go to wishlist
          <FontAwesomeIcon icon={faArrowRight} />
        </Link>
      </div>
    </AccountShell>
  );
};

export default AccountOrdersPage;
