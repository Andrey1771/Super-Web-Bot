import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
    faArrowLeft,
    faArrowRight,
    faChevronLeft,
    faChevronRight
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import { useRecommendations } from '../../../hooks/use-recommendations';
import RecommendationsSection from '../../../components/recommendations/recommendations-section';
import AddPaymentMethodModal from '../billing/components/AddPaymentMethodModal';
import {
    createSetupIntent,
    deletePaymentMethod,
    downloadInvoicePdf,
    downloadMyData,
    getBillingSummary,
    getInvoices,
    makeDefaultPaymentMethod
} from '../api/accountBillingApi';
import type {BillingSummaryDto, InvoiceDto, PagedResult, PaymentMethodDto} from '../api/accountBillingApi';
import './account-billing-page.css';

const AccountBillingPage: React.FC = () => {
    const [summary, setSummary] = useState<BillingSummaryDto | null>(null);
    const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
    const [pagination, setPagination] = useState<PagedResult<InvoiceDto> | null>(null);
    const [page, setPage] = useState(1);
    const [isLoadingSummary, setIsLoadingSummary] = useState(true);
    const [isLoadingInvoices, setIsLoadingInvoices] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isAddMethodOpen, setIsAddMethodOpen] = useState(false);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [deletingMethodId, setDeletingMethodId] = useState<string | null>(null);

    const {
        items: recommendations,
        isLoading: isRecommendationsLoading,
        error: recommendationsError,
        reload: reloadRecommendations
    } = useRecommendations(6);

    const fetchSummary = useCallback(async () => {
        setIsLoadingSummary(true);
        setErrorMessage(null);
        try {
            const data = await getBillingSummary();
            setSummary(data);
        } catch (error) {
            setErrorMessage('Unable to load billing summary.');
        } finally {
            setIsLoadingSummary(false);
        }
    }, []);

    const fetchInvoices = useCallback(async () => {
        setIsLoadingInvoices(true);
        setErrorMessage(null);
        try {
            const data = await getInvoices(page, 4);
            setInvoices(data.items);
            setPagination(data);
        } catch (error) {
            setErrorMessage('Unable to load invoices.');
        } finally {
            setIsLoadingInvoices(false);
        }
    }, [page]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    useEffect(() => {
        fetchInvoices();
    }, [fetchInvoices]);

    const totalPages = useMemo(() => {
        if (!pagination) {
            return 1;
        }
        return Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
    }, [pagination]);

    const handleRequestIntent = useCallback(async () => {
        try {
            const response = await createSetupIntent();
            setClientSecret(response.clientSecret);
        } catch (error) {
            setErrorMessage('Unable to start Stripe setup.');
        }
    }, []);

    const handleOpenAddMethod = useCallback(() => {
        setClientSecret(null);
        setIsAddMethodOpen(true);
    }, []);

    const handleCloseAddMethod = useCallback(() => {
        setClientSecret(null);
        setIsAddMethodOpen(false);
    }, []);

    const handleSaveMethod = useCallback(async () => {
        setIsActionLoading(true);
        try {
            await fetchSummary();
            handleCloseAddMethod();
        } finally {
            setIsActionLoading(false);
        }
    }, [fetchSummary, handleCloseAddMethod]);

    const handleMakeDefault = async (methodId: string) => {
        setIsActionLoading(true);
        try {
            await makeDefaultPaymentMethod(methodId);
            await fetchSummary();
        } catch (error) {
            setErrorMessage('Unable to update default method.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleRemoveMethod = async (methodId: string) => {
        const confirmRemove = window.confirm('Remove this payment method?');
        if (!confirmRemove) {
            return;
        }
        setDeletingMethodId(methodId);
        try {
            await deletePaymentMethod(methodId);
            await fetchSummary();
        } catch (error) {
            setErrorMessage('Unable to remove payment method.');
        } finally {
            setDeletingMethodId(null);
        }
    };

    const handleDownloadInvoice = async (invoiceId: string) => {
        setIsActionLoading(true);
        try {
            const file = await downloadInvoicePdf(invoiceId);
            const url = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = url;
            link.download = `invoice-${invoiceId}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            setErrorMessage('Unable to download invoice PDF.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDownloadData = async () => {
        setIsActionLoading(true);
        try {
            const file = await downloadMyData();
            const url = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'account-data.json';
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            setErrorMessage('Unable to download data export.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const filteredRecommendations = useMemo(
        () => recommendations.filter((item) => item.game?.title && item.game?.price),
        [recommendations]
    );

    return (
        <AccountShell
            title="My account"
            sectionLabel="Billing"
            subtitle={<h2 className="billing-title">Billing</h2>}
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
            <div className="card billing-card">
                <div className="billing-card-header">
                    <h3>Saved payment methods</h3>
                </div>
                <div className="billing-form-grid">
                    <label className="billing-field">
                        <span>Display name</span>
                        <input
                            className="billing-input"
                            type="text"
                            value={summary?.displayName ?? ''}
                            readOnly
                        />
                    </label>
                    <label className="billing-field">
                        <span>Email address</span>
                        <div className="billing-input-with-icon">
                            <input
                                className="billing-input"
                                type="email"
                                value={summary?.email ?? ''}
                                readOnly
                            />
                            <FontAwesomeIcon icon={faChevronRight} />
                        </div>
                    </label>
                </div>
                <div className="billing-methods">
                    {isLoadingSummary && <div className="billing-method-empty">Loading payment methods…</div>}
                    {!isLoadingSummary && summary?.paymentMethods.length === 0 && (
                        <div className="billing-method-empty">
                            <p>No payment methods yet.</p>
                            <button type="button" className="btn btn-primary" onClick={handleOpenAddMethod}>
                                Add method
                            </button>
                        </div>
                    )}
                    {!isLoadingSummary && summary?.paymentMethods.map((method: PaymentMethodDto) => (
                        <div key={method.id} className="billing-method-card">
                            <div>
                                <span className="billing-method-brand">{method.brand}</span>
                                <p>•••• {method.last4}</p>
                            </div>
                            <div className="billing-method-meta">
                                {method.isDefault && <span className="billing-method-label">Primary</span>}
                                <span>Expires {method.expMonth}/{method.expYear}</span>
                            </div>
                            <div className="billing-method-actions">
                                {!method.isDefault && (
                                    <button
                                        type="button"
                                        className="btn btn-outline billing-method-btn"
                                        onClick={() => handleMakeDefault(method.id)}
                                        disabled={isActionLoading}
                                    >
                                        Make default
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="btn btn-outline billing-method-btn"
                                    onClick={() => handleRemoveMethod(method.id)}
                                    disabled={deletingMethodId === method.id}
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                    <button type="button" className="btn btn-outline billing-add-btn" onClick={handleOpenAddMethod}>
                        Add method
                    </button>
                </div>
                <div className="billing-card-footer">
                    <button type="button" className="billing-link-btn" onClick={handleOpenAddMethod}>
                        Manage payment methods
                    </button>
                </div>
            </div>

            <div className="card billing-card">
                <div className="billing-card-header">
                    <h3>Billing details</h3>
                </div>
                <div className="billing-details">
                    <p>Billing details are collected securely during checkout.</p>
                </div>
            </div>

            <div className="card billing-card">
                <div className="billing-card-header">
                    <h3>Invoices</h3>
                </div>
                <div className="billing-table-wrapper">
                    <table className="billing-table">
                        <thead>
                        <tr>
                            <th>Order</th>
                            <th>ID</th>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Invoice</th>
                        </tr>
                        </thead>
                        <tbody>
                        {isLoadingInvoices && (
                            <tr>
                                <td colSpan={5}>Loading invoices...</td>
                            </tr>
                        )}
                        {!isLoadingInvoices && invoices.length === 0 && (
                            <tr>
                                <td colSpan={5}>No invoices available.</td>
                            </tr>
                        )}
                        {!isLoadingInvoices && invoices.map((invoice) => (
                            <tr key={invoice.invoiceId}>
                                <td>{invoice.orderNumber}</td>
                                <td>{invoice.invoiceId}</td>
                                <td>{new Date(invoice.date).toLocaleDateString()}</td>
                                <td>
                                    {invoice.amount.toFixed(2)} {invoice.currency}
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        className="btn btn-outline billing-download-btn"
                                        onClick={() => handleDownloadInvoice(invoice.invoiceId)}
                                        disabled={isActionLoading}
                                    >
                                        Download PDF
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
                <div className="billing-pagination">
                    <div className="billing-pagination-controls">
                        <button
                            type="button"
                            className="btn btn-outline billing-page-btn"
                            aria-label="Previous page"
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                            disabled={page <= 1}
                        >
                            <FontAwesomeIcon icon={faChevronLeft} />
                        </button>
                        {Array.from({length: totalPages}).map((_, index) => {
                            const pageNumber = index + 1;
                            return (
                                <button
                                    key={pageNumber}
                                    type="button"
                                    className={`btn btn-outline billing-page-btn${pageNumber === page ? ' is-active' : ''}`}
                                    onClick={() => setPage(pageNumber)}
                                >
                                    {pageNumber}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            className="btn btn-outline billing-page-btn"
                            aria-label="Next page"
                            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                            disabled={page >= totalPages}
                        >
                            <FontAwesomeIcon icon={faChevronRight} />
                        </button>
                    </div>
                    <span className="billing-pagination-note">
                        Showing {invoices.length} of {pagination?.total ?? 0}
                    </span>
                </div>
            </div>

            <div className="card billing-card billing-privacy-card">
                <div className="billing-card-header">
                    <h3>Privacy &amp; data</h3>
                </div>
                <div className="billing-privacy-row">
                    <button type="button" className="btn btn-outline billing-download-btn" onClick={handleDownloadData}>
                        Download my data
                    </button>
                </div>
            </div>

            <section className="billing-recommendations">
                <div className="billing-recommendations-header">
                    <h3>Recommendations based on your wishlist</h3>
                    <div className="billing-recommendations-arrows">
                        <button type="button" className="btn btn-outline billing-arrow-btn" aria-label="Scroll left">
                            <FontAwesomeIcon icon={faArrowLeft} />
                        </button>
                        <button type="button" className="btn btn-outline billing-arrow-btn" aria-label="Scroll right">
                            <FontAwesomeIcon icon={faArrowRight} />
                        </button>
                    </div>
                </div>
                <RecommendationsSection
                    items={filteredRecommendations}
                    isLoading={isRecommendationsLoading}
                    error={recommendationsError}
                    onRetry={reloadRecommendations}
                    emptyMessage="Add games to your wishlist or view a few games to get recommendations."
                    listClassName="billing-recommendations-list"
                    stateClassName="billing-recommendations-state"
                    renderSkeleton={(index) => (
                        <div key={`rec-skeleton-${index}`} className="card billing-recommendation-card is-skeleton" />
                    )}
                    renderItem={(item) => (
                        <div key={item.game.id ?? item.game.title} className="card billing-recommendation-card">
                            <div className="billing-recommendation-media">
                                {item.game.imagePath ? (
                                    <img src={item.game.imagePath} alt={item.game.title} />
                                ) : (
                                    <div className="billing-recommendation-fallback" aria-hidden="true" />
                                )}
                            </div>
                            <div className="billing-recommendation-body">
                                <strong>{item.game.title}</strong>
                                <span className="billing-recommendation-price">
                                    ${Number(item.game.price).toFixed(2)}
                                </span>
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary billing-recommendation-btn"
                                disabled={!item.game.id}
                            >
                                Add to cart
                            </button>
                        </div>
                    )}
                />
            </section>

            <AddPaymentMethodModal
                isOpen={isAddMethodOpen}
                clientSecret={clientSecret}
                isLoading={isActionLoading}
                onClose={handleCloseAddMethod}
                onSave={handleSaveMethod}
                onRequestIntent={handleRequestIntent}
            />
        </AccountShell>
    );
};

export default AccountBillingPage;
