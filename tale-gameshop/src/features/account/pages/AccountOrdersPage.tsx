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
import SafeGameImage from '../../../components/common/SafeGameImage';
import { useSitePreferences } from '../../../context/site-preferences';
import { formatMoney, formatOrderMoney } from '../../../utils/format-money';
import './account-orders-page.css';

const PAGE_SIZE = 10;

type StatusFilter = 'all' | 'completed' | 'refunded' | 'pending' | 'failed';
type SortOption = 'newest' | 'oldest' | 'total_desc' | 'total_asc';

type OrderDetailItem = AccountOrderDetails['items'][number];

// Суммы заказа форматируются в валюте самого заказа — она зафиксирована при оплате.
const formatCurrency = (value: number, currency?: string | null) => formatOrderMoney(value, currency);

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
  if (normalized === 'FAILED' || normalized === 'CANCELLED') {
    return { label: 'Failed', className: 'status-failed' };
  }
  if (normalized === 'PENDING') {
    return { label: 'Pending', className: 'status-processing' };
  }
  if (normalized === 'AWAITING_KEYS' || normalized === 'PENDING_KEYS' || normalized === 'PARTIAL') {
    // Оплачено, но ключей на складе пока не хватило — довыдадим при пополнении пула.
    return { label: 'Awaiting keys', className: 'status-processing' };
  }

  return { label: 'Processing', className: 'status-processing' };
};

const buildPages = (current: number, total: number) => {
  if (total <= 1) {
    return [] as Array<number | 'ellipsis'>;
  }

  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1) as Array<number | 'ellipsis'>;
  }

  if (current <= 3) {
    return [1, 2, 3, 4, 'ellipsis', total - 1, total];
  }

  if (current >= total - 2) {
    return [1, 2, 'ellipsis', total - 3, total - 2, total - 1, total];
  }

  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
};

const OrderItemRow: React.FC<{ item: OrderDetailItem }> = ({ item }) => {
  const isClickable = Boolean(item.gameId);
  const RowTag = isClickable ? Link : 'div';
  const rowProps = isClickable
    ? ({ to: `/games/${item.gameId}` } as const)
    : ({} as const);

  return (
    <RowTag
      {...rowProps}
      className={`order-line-item ${isClickable ? 'is-clickable' : ''}`}
      aria-label={isClickable ? `Open ${item.title}` : undefined}
    >
      <div className="order-line-cover">
        {item.coverUrl ? <img src={item.coverUrl} alt={item.title} /> : <div className="order-line-cover-fallback" />}
      </div>

      <div className="order-line-main">
        <strong className="order-line-title">{item.title}</strong>
        {(item.platform || item.region) && (
          <div className="order-line-secondary-meta">
            {item.platform ? <span>{item.platform}</span> : null}
            {item.region ? <span>{item.region}</span> : null}
          </div>
        )}
        {item.keys.length > 0 ? (
          <div className="order-line-keys">
            <strong>Keys:</strong>
            {item.keys.map((key) => <span key={key}>{key}</span>)}
          </div>
        ) : (
          <div className="order-line-keys order-line-keys--pending">
            <span>Awaiting key delivery — you’ll be notified once it’s in stock.</span>
          </div>
        )}
      </div>

      <div className="order-line-pricing">
        <span>Qty: {item.quantity}</span>
        <span>{formatCurrency(item.finalUnitPrice, item.currency)} each</span>
        <strong>{formatCurrency(item.lineTotal, item.currency)}</strong>
      </div>
    </RowTag>
  );
};

const OrderSummaryCard: React.FC<{ details: AccountOrderDetails }> = ({ details }) => (
  <aside className="order-summary-card">
    <h4>Summary</h4>
    <div className="order-summary-row">
      <span>Subtotal</span>
      <span>{formatCurrency(details.totals.subtotal, details.currency)}</span>
    </div>
    <div className="order-summary-row">
      <span>Discount</span>
      <span>-{formatCurrency(details.totals.discountTotal, details.currency)}</span>
    </div>
    <div className="order-summary-row">
      <span>Tax</span>
      <span>{formatCurrency(details.totals.taxTotal, details.currency)}</span>
    </div>
    <div className="order-summary-divider" />
    <div className="order-summary-row order-summary-total">
      <span>Total</span>
      <span>{formatCurrency(details.totals.total, details.currency)}</span>
    </div>
  </aside>
);

const OrderDetails: React.FC<{ details: AccountOrderDetails }> = ({ details }) => (
  <div className="order-details-layout">
    <section className="order-line-items" aria-label="Order items">
      {details.items.map((item) => (
        <OrderItemRow key={item.itemId} item={item} />
      ))}
    </section>
    <OrderSummaryCard details={details} />
  </div>
);

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
            <OrderDetails details={details} />
          )}
        </div>
      )}
    </div>
  );
};

const AccountOrdersPage: React.FC = () => {
  const { currency } = useSitePreferences();
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

  // Тулбар (поиск/сортировка/фильтры) не показываем на пустом списке — фильтровать нечего.
  const showToolbar = totalCount > 0 || searchInput.trim() !== '' || status !== 'all';

  return (
    <AccountShell
      title={ordersTitle}
      sectionLabel="Orders"
      subtitle={ordersSubtitle}
    >
      {showToolbar && (
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
      )}

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

      {totalPages > 1 && (
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
            {pages.map((item, index) => (
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
              )
            ))}
            <button
              type="button"
              className="btn btn-outline orders-page-btn"
              aria-label="Next page"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={isOrdersLoading || page >= totalPages}
            >
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </div>
          <span className="orders-pagination-note">{ordersSubtitle}</span>
        </div>
      )}

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
                <SafeGameImage src={item.game.imagePath} gameTitle={item.game.title} />
              </div>
              <div className="orders-recommendation-body">
                <strong>{item.game.title}</strong>
                <span className="orders-recommendation-price">
                  {formatMoney(Number(item.game.price), currency)}
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
