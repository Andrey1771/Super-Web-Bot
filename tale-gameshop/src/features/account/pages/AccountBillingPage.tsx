import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
    faChevronLeft,
    faChevronRight,
    faCircleExclamation
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import './account-billing-page.css';
import AddCardModal from '../../../components/billing/AddCardModal';
import CardBrandIcon from '../../../components/billing/CardBrandIcon';
import {
    createSetupIntent,
    downloadDataExport,
    downloadInvoicePdf,
    fetchBillingProfile,
    fetchInvoices,
    fetchPaymentMethods,
    removePaymentMethod,
    setDefaultPaymentMethod,
    updateBillingProfile
} from '../../../api/billing-api';
import type { BillingDetailsDto, BillingProfileDto, InvoiceDto, PaymentMethodDto } from '../../../api/billing-api';

const AccountBillingPage: React.FC = () => {
    const [profile, setProfile] = useState<BillingProfileDto | null>(null);
    const [profileDraft, setProfileDraft] = useState<BillingProfileDto | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState<string | null>(null);

    const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDto[]>([]);
    const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(true);
    const [paymentMethodsError, setPaymentMethodsError] = useState<string | null>(null);

    const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
    const [invoicesLoading, setInvoicesLoading] = useState(true);
    const [invoicesError, setInvoicesError] = useState<string | null>(null);
    const [invoicePage, setInvoicePage] = useState(1);
    const [invoiceTotalCount, setInvoiceTotalCount] = useState(0);
    const invoicePageSize = 10;

    const [isAddCardOpen, setIsAddCardOpen] = useState(false);
    const [isBillingDetailsOpen, setIsBillingDetailsOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isDownloadingData, setIsDownloadingData] = useState(false);
    const [isDownloadingInvoice, setIsDownloadingInvoice] = useState<string | null>(null);
    const profileDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const invoiceTotalPages = Math.max(1, Math.ceil(invoiceTotalCount / invoicePageSize));

    const setToast = (message: string) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 3000);
    };

    const syncProfileDraft = (data: BillingProfileDto) => {
        setProfile(data);
        setProfileDraft(data);
    };

    const loadProfile = async () => {
        setProfileLoading(true);
        setProfileError(null);
        try {
            const data = await fetchBillingProfile();
            syncProfileDraft(data);
        } catch (error) {
            setProfileError('Unable to load billing profile.');
        } finally {
            setProfileLoading(false);
        }
    };

    const loadPaymentMethods = async () => {
        setPaymentMethodsLoading(true);
        setPaymentMethodsError(null);
        try {
            const data = await fetchPaymentMethods();
            setPaymentMethods(data);
        } catch (error) {
            setPaymentMethodsError('Unable to load payment methods.');
        } finally {
            setPaymentMethodsLoading(false);
        }
    };

    const loadInvoices = async (page: number) => {
        setInvoicesLoading(true);
        setInvoicesError(null);
        try {
            const data = await fetchInvoices(page, invoicePageSize);
            setInvoices(data.items);
            setInvoiceTotalCount(data.totalCount);
        } catch (error) {
            setInvoicesError('Unable to load invoices.');
        } finally {
            setInvoicesLoading(false);
        }
    };

    useEffect(() => {
        loadProfile();
        loadPaymentMethods();
    }, []);

    useEffect(() => {
        loadInvoices(invoicePage);
    }, [invoicePage]);

    useEffect(() => {
        if (!profileDraft || !profile) {
            return;
        }
        if (profile.hideOwnedGamesInProfile === profileDraft.hideOwnedGamesInProfile) {
            return;
        }

        if (profileDebounceRef.current) {
            clearTimeout(profileDebounceRef.current);
        }

        profileDebounceRef.current = setTimeout(async () => {
            try {
                const updated = await updateBillingProfile({
                    hideOwnedGamesInProfile: profileDraft.hideOwnedGamesInProfile
                });
                syncProfileDraft(updated);
            } catch (error) {
                setToast('Unable to update privacy setting.');
            }
        }, 500);

        return () => {
            if (profileDebounceRef.current) {
                clearTimeout(profileDebounceRef.current);
            }
        };
    }, [profileDraft?.hideOwnedGamesInProfile]);

    const handleProfileChange = (updates: Partial<BillingProfileDto>) => {
        setProfileDraft((prev) => (prev ? { ...prev, ...updates } : prev));
    };

    const handleBillingDetailsChange = (updates: Partial<BillingDetailsDto>) => {
        setProfileDraft((prev) => {
            if (!prev) {
                return prev;
            }
            return {
                ...prev,
                billingDetails: {
                    ...(prev.billingDetails ?? {}),
                    ...updates
                }
            };
        });
    };

    const handleSaveProfile = async () => {
        if (!profileDraft) {
            return;
        }
        setIsSavingProfile(true);
        try {
            const updated = await updateBillingProfile({
                displayName: profileDraft.displayName,
                billingDetails: profileDraft.billingDetails,
                hideOwnedGamesInProfile: profileDraft.hideOwnedGamesInProfile
            });
            syncProfileDraft(updated);
            setToast('Billing profile updated.');
        } catch (error) {
            setToast('Unable to save profile changes.');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleSetDefault = async (methodId: string) => {
        try {
            await setDefaultPaymentMethod(methodId);
            await loadPaymentMethods();
            setToast('Default payment method updated.');
        } catch (error) {
            setToast('Unable to set default payment method.');
        }
    };

    const handleRemoveMethod = async (methodId: string) => {
        try {
            await removePaymentMethod(methodId);
            await loadPaymentMethods();
            setToast('Payment method removed.');
        } catch (error) {
            setToast('Unable to remove payment method.');
        }
    };

    const handleDownloadInvoice = async (invoice: InvoiceDto) => {
        setIsDownloadingInvoice(invoice.id);
        try {
            const blob = await downloadInvoicePdf(invoice.id);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `invoice_${invoice.orderId}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            setToast('Unable to download invoice.');
        } finally {
            setIsDownloadingInvoice(null);
        }
    };

    const handleDownloadData = async () => {
        setIsDownloadingData(true);
        try {
            const blob = await downloadDataExport();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'tale-shop-data-export.zip';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            setToast('Unable to download data export.');
        } finally {
            setIsDownloadingData(false);
        }
    };

    const handleAddCardSuccess = async () => {
        setIsAddCardOpen(false);
        await loadPaymentMethods();
        setToast('Card linked successfully.');
    };

    const handleCreateSetupIntent = useCallback(async () => {
        const response = await createSetupIntent();
        return response.clientSecret;
    }, []);

    const invoicePageButtons = useMemo(() => {
        const pages = new Set<number>([1, invoicePage, invoicePage - 1, invoicePage + 1, invoiceTotalPages]);
        return Array.from(pages)
            .filter((page) => page >= 1 && page <= invoiceTotalPages)
            .sort((a, b) => a - b);
    }, [invoicePage, invoiceTotalPages]);

    const formattedBillingDetails = useMemo(() => {
        const details = profile?.billingDetails;
        if (!details) {
            return [];
        }
        return [
            details.addressLine1,
            details.city,
            details.postalCode ? `${details.country ?? ''} ${details.postalCode}`.trim() : details.country,
            details.phone
        ].filter(Boolean) as string[];
    }, [profile]);

    return (
        <AccountShell
            title="Billing"
            sectionLabel="Billing"
            subtitle="Payment methods, invoices and billing details."
        >
            <div className="card billing-card">
                <div className="billing-card-header">
                    <h3>Saved payment methods</h3>
                </div>
                {/* Имя/email живут в Settings — здесь только платёжные методы, без дублей профиля. */}
                <div className="billing-methods">
                    {paymentMethodsLoading && (
                        Array.from({ length: 3 }).map((_, index) => (
                            <div key={`method-skeleton-${index}`} className="billing-method-card is-skeleton" />
                        ))
                    )}
                    {paymentMethodsError && (
                        <div className="billing-state billing-state-error">
                            <FontAwesomeIcon icon={faCircleExclamation} />
                            <span>{paymentMethodsError}</span>
                        </div>
                    )}
                    {!paymentMethodsLoading && !paymentMethodsError && paymentMethods.length === 0 && (
                        <div className="billing-state">
                            No payment methods yet. Link a card to get started.
                        </div>
                    )}
                    {!paymentMethodsLoading && !paymentMethodsError && paymentMethods.map((method) => (
                        <div key={method.id} className="billing-method-card">
                            <div className="billing-method-info">
                                <div className="billing-method-brandline">
                                    <CardBrandIcon brand={method.brand} />
                                    <span className="billing-method-brand">{method.brand}</span>
                                </div>
                                <p>•••• {method.last4}</p>
                            </div>
                            <div className="billing-method-meta">
                                <span className="billing-method-label">
                                    {method.isDefault ? 'Default' : method.label ?? 'Card'}
                                </span>
                                <span>Expires {String(method.expMonth).padStart(2, '0')}/{method.expYear}</span>
                            </div>
                            <div className="billing-method-actions">
                                {!method.isDefault && (
                                    <button
                                        type="button"
                                        className="billing-link-btn"
                                        onClick={() => handleSetDefault(method.id)}
                                    >
                                        Set default
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="billing-link-btn is-danger"
                                    onClick={() => handleRemoveMethod(method.id)}
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                    <button type="button" className="btn btn-outline billing-add-btn" onClick={() => setIsAddCardOpen(true)}>
                        Add method
                    </button>
                </div>
                {profileError && (
                    <div className="billing-state billing-state-error">
                        <FontAwesomeIcon icon={faCircleExclamation} />
                        <span>{profileError}</span>
                    </div>
                )}
            </div>

            <div className="card billing-card">
                <div className="billing-card-header">
                    <h3>Billing details</h3>
                    <button type="button" className="billing-link-btn" onClick={() => setIsBillingDetailsOpen(true)}>
                        Edit
                    </button>
                </div>
                <div className="billing-details">
                    {formattedBillingDetails.length > 0 ? (
                        <>
                            <p>{profile?.displayName}</p>
                            {formattedBillingDetails.map((line) => (
                                <p key={line}>{line}</p>
                            ))}
                        </>
                    ) : (
                        <p className="billing-muted">No billing details added yet.</p>
                    )}
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
                        {invoicesLoading && (
                            Array.from({ length: 4 }).map((_, index) => (
                                <tr key={`invoice-skeleton-${index}`} className="billing-table-row-skeleton">
                                    <td colSpan={5}>
                                        <div className="billing-table-skeleton" />
                                    </td>
                                </tr>
                            ))
                        )}
                        {!invoicesLoading && invoicesError && (
                            <tr>
                                <td colSpan={5} className="billing-table-state">
                                    <FontAwesomeIcon icon={faCircleExclamation} />
                                    <span>{invoicesError}</span>
                                </td>
                            </tr>
                        )}
                        {!invoicesLoading && !invoicesError && invoices.length === 0 && (
                            <tr>
                                <td colSpan={5} className="billing-table-state">
                                    No invoices available yet.
                                </td>
                            </tr>
                        )}
                        {!invoicesLoading && !invoicesError && invoices.map((invoice) => (
                            <tr key={invoice.id}>
                                <td>#{invoice.orderId}</td>
                                <td>{invoice.id}</td>
                                <td>{new Date(invoice.date).toLocaleDateString()}</td>
                                <td>
                                    {invoice.amount.toFixed(2)} {invoice.currency.toUpperCase()}
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        className="btn btn-outline billing-download-btn"
                                        onClick={() => handleDownloadInvoice(invoice)}
                                        disabled={!invoice.pdfAvailable || isDownloadingInvoice === invoice.id}
                                    >
                                        {isDownloadingInvoice === invoice.id ? 'Downloading...' : 'Download PDF'}
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
                            onClick={() => setInvoicePage((prev) => Math.max(1, prev - 1))}
                            disabled={invoicePage === 1}
                        >
                            <FontAwesomeIcon icon={faChevronLeft} />
                        </button>
                        {invoicePageButtons.map((page) => (
                            <button
                                type="button"
                                key={`invoice-page-${page}`}
                                className={`btn btn-outline billing-page-btn ${page === invoicePage ? 'is-active' : ''}`}
                                onClick={() => setInvoicePage(page)}
                            >
                                {page}
                            </button>
                        ))}
                        <button
                            type="button"
                            className="btn btn-outline billing-page-btn"
                            aria-label="Next page"
                            onClick={() => setInvoicePage((prev) => Math.min(invoiceTotalPages, prev + 1))}
                            disabled={invoicePage === invoiceTotalPages}
                        >
                            <FontAwesomeIcon icon={faChevronRight} />
                        </button>
                    </div>
                    <span className="billing-pagination-note">
                        {invoiceTotalCount === 0
                            ? 'Showing 0 of 0'
                            : `Showing ${(invoicePage - 1) * invoicePageSize + 1}-${Math.min(invoicePage * invoicePageSize, invoiceTotalCount)} of ${invoiceTotalCount}`}
                    </span>
                </div>
            </div>

            <div className="card billing-card billing-privacy-card">
                <div className="billing-card-header">
                    <h3>Privacy &amp; data</h3>
                </div>
                <div className="billing-privacy-row">
                    <label className="billing-checkbox">
                        <input
                            type="checkbox"
                            checked={profileDraft?.hideOwnedGamesInProfile ?? false}
                            onChange={(event) => handleProfileChange({ hideOwnedGamesInProfile: event.target.checked })}
                            disabled={profileLoading}
                        />
                        Hide owned games in profile
                    </label>
                    <button
                        type="button"
                        className="btn btn-outline billing-download-btn"
                        onClick={handleDownloadData}
                        disabled={isDownloadingData}
                    >
                        {isDownloadingData ? 'Preparing...' : 'Download my data'}
                    </button>
                </div>
            </div>

            <AddCardModal
                isOpen={isAddCardOpen}
                displayName={profileDraft?.displayName}
                onClose={() => setIsAddCardOpen(false)}
                onCreateSetupIntent={handleCreateSetupIntent}
                onSuccess={handleAddCardSuccess}
            />
            {isBillingDetailsOpen && (
                <div className="billing-modal-overlay" role="dialog" aria-modal="true">
                    <div className="billing-modal">
                        <div className="billing-modal-body">
                            <h3>Edit billing details</h3>
                            <p className="billing-modal-subtitle">Update your billing address for invoices.</p>
                            <div className="billing-card-form">
                                <label className="billing-field">
                                    <span>Address line</span>
                                    <input
                                        className="billing-input"
                                        type="text"
                                        value={profileDraft?.billingDetails?.addressLine1 ?? ''}
                                        onChange={(event) => handleBillingDetailsChange({ addressLine1: event.target.value })}
                                    />
                                </label>
                                <div className="billing-form-row">
                                    <label className="billing-field">
                                        <span>City</span>
                                        <input
                                            className="billing-input"
                                            type="text"
                                            value={profileDraft?.billingDetails?.city ?? ''}
                                            onChange={(event) => handleBillingDetailsChange({ city: event.target.value })}
                                        />
                                    </label>
                                    <label className="billing-field">
                                        <span>Postal code</span>
                                        <input
                                            className="billing-input"
                                            type="text"
                                            value={profileDraft?.billingDetails?.postalCode ?? ''}
                                            onChange={(event) => handleBillingDetailsChange({ postalCode: event.target.value })}
                                        />
                                    </label>
                                </div>
                                <div className="billing-form-row">
                                    <label className="billing-field">
                                        <span>Country</span>
                                        <input
                                            className="billing-input"
                                            type="text"
                                            value={profileDraft?.billingDetails?.country ?? ''}
                                            onChange={(event) => handleBillingDetailsChange({ country: event.target.value })}
                                        />
                                    </label>
                                    <label className="billing-field">
                                        <span>Phone</span>
                                        <input
                                            className="billing-input"
                                            type="text"
                                            value={profileDraft?.billingDetails?.phone ?? ''}
                                            onChange={(event) => handleBillingDetailsChange({ phone: event.target.value })}
                                        />
                                    </label>
                                </div>
                            </div>
                            <div className="billing-modal-actions">
                                <button type="button" className="btn btn-outline" onClick={() => setIsBillingDetailsOpen(false)}>
                                    Cancel
                                </button>
                                <button type="button" className="btn btn-primary" onClick={() => {
                                    setIsBillingDetailsOpen(false);
                                    handleSaveProfile();
                                }}>
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {toastMessage && <div className="billing-toast">{toastMessage}</div>}
        </AccountShell>
    );
};

export default AccountBillingPage;
