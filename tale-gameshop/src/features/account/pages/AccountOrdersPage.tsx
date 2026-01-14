import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Link, useNavigate, useSearchParams} from 'react-router-dom';
import AccountShell from '../components/AccountShell';
import {fetchAccountOrders, fetchOrderInvoice} from '../services/accountOrdersApi';
import type {AccountOrder, AccountOrdersResponse} from '../types';
import container from '../../../inversify.config';
import {IUrlService} from '../../../iterfaces/i-url-service';
import IDENTIFIERS from '../../../constants/identifiers';
import './account-orders-page.css';

const DEFAULT_PAGE_SIZE = 12;
const DEFAULT_SORT = 'newest';
const DEFAULT_STATUS = 'all';

const sortOptions = [
    {value: 'newest', label: 'Newest'},
    {value: 'oldest', label: 'Oldest'},
    {value: 'amount_desc', label: 'Amount: high to low'},
    {value: 'amount_asc', label: 'Amount: low to high'}
];

const statusOptions = [
    {value: 'all', label: 'All'},
    {value: 'Processing', label: 'Processing'},
    {value: 'Completed', label: 'Completed'}
];

const AccountOrdersPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [searchInput, setSearchInput] = useState('');
    const [orders, setOrders] = useState<AccountOrder[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadToken, setReloadToken] = useState(0);
    const navigate = useNavigate();
    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    const qParam = searchParams.get('q') ?? '';
    const statusParam = searchParams.get('status') ?? DEFAULT_STATUS;
    const sortParam = searchParams.get('sort') ?? DEFAULT_SORT;
    const pageParam = Number.parseInt(searchParams.get('page') ?? '1', 10) || 1;
    const pageSizeParam =
        Number.parseInt(searchParams.get('pageSize') ?? `${DEFAULT_PAGE_SIZE}`, 10) || DEFAULT_PAGE_SIZE;

    const updateSearchParams = useCallback(
        (updates: Record<string, string | number | null>) => {
            const nextParams = new URLSearchParams(searchParams);

            Object.entries(updates).forEach(([key, value]) => {
                const stringValue = value === null ? '' : String(value);
                if (!stringValue) {
                    nextParams.delete(key);
                    return;
                }

                if (key === 'status' && stringValue === DEFAULT_STATUS) {
                    nextParams.delete(key);
                    return;
                }

                if (key === 'sort' && stringValue === DEFAULT_SORT) {
                    nextParams.delete(key);
                    return;
                }

                if (key === 'page' && stringValue === '1') {
                    nextParams.delete(key);
                    return;
                }

                if (key === 'pageSize' && stringValue === `${DEFAULT_PAGE_SIZE}`) {
                    nextParams.delete(key);
                    return;
                }

                nextParams.set(key, stringValue);
            });

            setSearchParams(nextParams);
        },
        [searchParams, setSearchParams]
    );

    useEffect(() => {
        setSearchInput(qParam);
    }, [qParam]);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            if (searchInput !== qParam) {
                updateSearchParams({q: searchInput, page: 1});
            }
        }, 400);

        return () => window.clearTimeout(timeout);
    }, [qParam, searchInput, updateSearchParams]);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);

        const query: Record<string, string | number> = {
            sort: sortParam,
            page: pageParam,
            pageSize: pageSizeParam
        };

        if (qParam) {
            query.q = qParam;
        }

        if (statusParam && statusParam !== DEFAULT_STATUS) {
            query.status = statusParam;
        }

        fetchAccountOrders(query, controller.signal)
            .then((data: AccountOrdersResponse) => {
                setOrders(data.items);
                setTotal(data.total);
                setLoading(false);
            })
            .catch((err: Error) => {
                if (controller.signal.aborted) {
                    return;
                }
                console.error(err);
                setError('We could not load your orders. Please try again.');
                setLoading(false);
            });

        return () => controller.abort();
    }, [pageParam, pageSizeParam, qParam, reloadToken, sortParam, statusParam]);

    const totalPages = Math.max(1, Math.ceil(total / pageSizeParam));
    const showingStart = total === 0 ? 0 : (pageParam - 1) * pageSizeParam + 1;
    const showingEnd = Math.min(pageParam * pageSizeParam, total);

    const paginationItems = useMemo(() => {
        const pages: Array<number | 'ellipsis'> = [];

        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i += 1) {
                pages.push(i);
            }
            return pages;
        }

        pages.push(1);

        if (pageParam > 3) {
            pages.push('ellipsis');
        }

        const start = Math.max(2, pageParam - 1);
        const end = Math.min(totalPages - 1, pageParam + 1);

        for (let i = start; i <= end; i += 1) {
            pages.push(i);
        }

        if (pageParam < totalPages - 2) {
            pages.push('ellipsis');
        }

        pages.push(totalPages);

        return pages;
    }, [pageParam, totalPages]);

    const hasActiveFilters =
        qParam.length > 0 ||
        statusParam !== DEFAULT_STATUS ||
        sortParam !== DEFAULT_SORT ||
        pageParam !== 1 ||
        pageSizeParam !== DEFAULT_PAGE_SIZE;

    const formatCurrency = (value: number, currency: string) => {
        try {
            return new Intl.NumberFormat('en-US', {style: 'currency', currency}).format(value);
        } catch (error) {
            return `${value.toFixed(2)} ${currency}`;
        }
    };

    const formatDate = (dateValue: string) =>
        new Date(dateValue).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

    const handleStatusChange = (value: string) => {
        updateSearchParams({status: value, page: 1});
    };

    const handleSortChange = (value: string) => {
        updateSearchParams({sort: value, page: 1});
    };

    const handleClearFilters = () => {
        setSearchInput('');
        setSearchParams(new URLSearchParams());
    };

    const handleCopyOrderId = async (orderId: string) => {
        try {
            await navigator.clipboard.writeText(orderId);
        } catch (copyError) {
            console.error(copyError);
        }
    };

    const handleInvoiceDownload = async (orderId: string) => {
        try {
            const blob = await fetchOrderInvoice(orderId);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `invoice-${orderId}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (downloadError) {
            console.error(downloadError);
        }
    };

    const handleViewKeys = (order: AccountOrder) => {
        if (!order.keysAvailable) {
            return;
        }
        navigate(`/account/keys?orderId=${encodeURIComponent(order.orderId)}`);
    };

    return (
        <AccountShell title="My account" sectionLabel="Orders" subtitle={`Orders (${total})`}>
            <div className="card account-card account-orders-toolbar">
                <div className="account-orders-toolbar-row">
                    <label className="account-orders-search">
                        <span className="account-orders-label">Search</span>
                        <input
                            type="search"
                            placeholder="Search in orders…"
                            value={searchInput}
                            onChange={(event) => setSearchInput(event.target.value)}
                        />
                    </label>
                    <label className="account-orders-select">
                        <span className="account-orders-label">Sort</span>
                        <select
                            value={sortParam}
                            onChange={(event) => handleSortChange(event.target.value)}
                        >
                            {sortOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="account-orders-status-filter">
                        <span className="account-orders-label">Status</span>
                        <div className="account-orders-status-chips">
                            {statusOptions.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={`status-chip${
                                        statusParam === option.value ? ' active' : ''
                                    }`}
                                    onClick={() => handleStatusChange(option.value)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {hasActiveFilters && (
                        <button
                            type="button"
                            className="btn btn-outline account-action-btn"
                            onClick={handleClearFilters}
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            </div>

            {loading && (
                <div className="account-orders-skeleton">
                    {[1, 2, 3].map((value) => (
                        <div key={value} className="card account-card account-order-card skeleton-card">
                            <div className="skeleton skeleton-line" />
                            <div className="skeleton skeleton-line" />
                            <div className="skeleton skeleton-line short" />
                        </div>
                    ))}
                </div>
            )}

            {!loading && error && (
                <div className="card account-card account-orders-state">
                    <p>{error}</p>
                        <button
                            type="button"
                            className="btn btn-primary account-action-btn"
                            onClick={() => setReloadToken((prev) => prev + 1)}
                        >
                        Retry
                    </button>
                </div>
            )}

            {!loading && !error && orders.length === 0 && (
                <div className="card account-card account-orders-state">
                    <h3>No orders found</h3>
                    <p>Try adjusting your filters or explore the store for new releases.</p>
                    <Link to="/store" className="btn btn-primary account-action-btn">
                        Go to store
                    </Link>
                </div>
            )}

            {!loading && !error && orders.length > 0 && (
                <div className="account-orders-list">
                    {orders.map((order) => {
                        const statusKey = order.status.toLowerCase();
                        const keysLabel = order.keysCount > 1 ? 'View keys' : 'View key';

                        return (
                            <div key={order.orderId} className="card account-card account-order-card">
                                <div className="account-order-main">
                                    <div className="account-order-meta">
                                        <span className="account-order-date">
                                            {formatDate(order.createdAt)}
                                        </span>
                                        <button
                                            type="button"
                                            className="account-order-id"
                                            onClick={() => handleCopyOrderId(order.orderId)}
                                        >
                                            #{order.orderId}
                                        </button>
                                    </div>
                                    <div className="account-order-items">
                                        {order.items.map((item) => {
                                            const itemCoverUrl = item.coverUrl
                                                ? `${urlService.apiBaseUrl}/${item.coverUrl}`
                                                : null;

                                            return (
                                                <div key={item.gameId ?? item.title} className="order-item">
                                                    <div className="order-item-cover">
                                                        {itemCoverUrl ? (
                                                            <img src={itemCoverUrl} alt={item.title} />
                                                        ) : (
                                                            <div className="order-item-cover-placeholder" />
                                                        )}
                                                    </div>
                                                <div className="order-item-body">
                                                    <strong title={item.title}>{item.title}</strong>
                                                    <span>
                                                        {item.qty} × {item.title}
                                                    </span>
                                                </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="account-order-side">
                                    <span className="account-order-amount">
                                        {formatCurrency(order.total, order.currency)}
                                    </span>
                                    <span className={`status-pill status-${statusKey}`}>
                                        {order.status}
                                    </span>
                                    <div className="account-order-actions">
                                        <button
                                            type="button"
                                            className="btn btn-primary account-action-btn"
                                            disabled={!order.keysAvailable}
                                            onClick={() => handleViewKeys(order)}
                                        >
                                            {order.keysAvailable ? keysLabel : 'Processing'}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-outline account-action-btn"
                                            disabled={!order.hasInvoice}
                                            onClick={() => handleInvoiceDownload(order.orderId)}
                                        >
                                            Invoice
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {!loading && !error && orders.length > 0 && (
                <div className="account-orders-pagination card account-card">
                    <div className="account-orders-pagination-info">
                        Showing {showingStart}-{showingEnd} of {total}
                    </div>
                    <div className="account-orders-pagination-controls">
                        <button
                            type="button"
                            className="pagination-btn"
                            disabled={pageParam === 1}
                            onClick={() => updateSearchParams({page: pageParam - 1})}
                        >
                            Prev
                        </button>
                        {paginationItems.map((item, index) =>
                            item === 'ellipsis' ? (
                                <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                                    …
                                </span>
                            ) : (
                                <button
                                    key={item}
                                    type="button"
                                    className={`pagination-btn${
                                        pageParam === item ? ' active' : ''
                                    }`}
                                    onClick={() => updateSearchParams({page: item})}
                                >
                                    {item}
                                </button>
                            )
                        )}
                        <button
                            type="button"
                            className="pagination-btn"
                            disabled={pageParam === totalPages}
                            onClick={() => updateSearchParams({page: pageParam + 1})}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </AccountShell>
    );
};

export default AccountOrdersPage;
