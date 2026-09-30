import { useTranslation } from 'react-i18next';
import { formatDate } from '../../../i18n/format';
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
import PaymentCardTile from '../../../components/billing/PaymentCardTile';
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
    const { t } = useTranslation();
    const [profile, setProfile] = useState<BillingProfileDto | null>(null);
    const [profileDraft, setProfileDraft] = useState<BillingProfileDto | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState<string | null>(null);

    const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDto[]>([]);
    const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(true);
    const [busyMethodId, setBusyMethodId] = useState<string | null>(null);
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
            setProfileError(t('account.billing.toast.profileLoadFailed'));
        } finally {
            setProfileLoading(false);
        }
    };

    // silent — обновить список, не убирая карты с экрана: скелеты только при первой загрузке. Иначе после
    // «сделать основной» карты на миг пропадали и появлялись заново.
    const loadPaymentMethods = async (silent = false) => {
        if (!silent) {
            setPaymentMethodsLoading(true);
        }
        setPaymentMethodsError(null);
        try {
            const data = await fetchPaymentMethods();
            setPaymentMethods(data);
        } catch (error) {
            if (!silent) {
                setPaymentMethodsError(t('account.billing.toast.methodsLoadFailed'));
            }
        } finally {
            if (!silent) {
                setPaymentMethodsLoading(false);
            }
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
            setInvoicesError(t('account.billing.toast.invoicesLoadFailed'));
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
                setToast(t('account.billing.toast.privacyFailed'));
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
            setToast(t('account.billing.toast.profileUpdated'));
        } catch (error) {
            setToast(t('account.billing.toast.profileSaveFailed'));
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleSetDefault = async (methodId: string) => {
        setBusyMethodId(methodId);
        // Звезда переезжает сразу, сервер подтверждает следом; не подтвердил — список перечитывается как есть.
        setPaymentMethods((prev) => prev.map((method) => ({ ...method, isDefault: method.id === methodId })));
        try {
            await setDefaultPaymentMethod(methodId);
            await loadPaymentMethods(true);
            setToast(t('account.billing.toast.defaultUpdated'));
        } catch (error) {
            await loadPaymentMethods(true);
            setToast(t('account.billing.toast.defaultFailed'));
        } finally {
            setBusyMethodId(null);
        }
    };

    const handleRemoveMethod = async (methodId: string) => {
        setBusyMethodId(methodId);
        try {
            await removePaymentMethod(methodId);
            setPaymentMethods((prev) => prev.filter((method) => method.id !== methodId));
            await loadPaymentMethods(true);
            setToast(t('account.billing.toast.methodRemoved'));
        } catch (error) {
            setToast(t('account.billing.toast.removeFailed'));
        } finally {
            setBusyMethodId(null);
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
            setToast(t('account.billing.toast.invoiceFailed'));
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
            setToast(t('account.billing.toast.exportFailed'));
        } finally {
            setIsDownloadingData(false);
        }
    };

    const handleAddCardSuccess = async () => {
        setIsAddCardOpen(false);
        await loadPaymentMethods();
        setToast(t('account.billing.toast.cardLinked'));
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
            title={t('account.billing.title')}
            sectionLabel={t('account.billing.title')}
            subtitle={t('account.billing.subtitle')}
        >
            <div className="card billing-card">
                <div className="billing-card-header">
                    <h3>{t('account.billing.savedMethods')}</h3>
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
                            {t('account.billing.noMethods')}
                        </div>
                    )}
                    {!paymentMethodsLoading && !paymentMethodsError && paymentMethods.map((method) => (
                        // Карта нарисована как карта (см. PaymentCardTile): система по цвету и знаку, номер, срок,
                        // метка «Default» на пластике. Строка настроек с мелким значком картой не читалась.
                        <PaymentCardTile
                            key={method.id}
                            method={method}
                            busy={busyMethodId === method.id}
                            onSetDefault={handleSetDefault}
                            onRemove={handleRemoveMethod}
                        />
                    ))}
                    <button type="button" className="btn btn-outline billing-add-btn" onClick={() => setIsAddCardOpen(true)}>
                        {t('account.billing.addMethod')}
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
                    <h3>{t('account.billing.details')}</h3>
                    <button type="button" className="billing-link-btn" onClick={() => setIsBillingDetailsOpen(true)}>
                        {t('common.edit')}
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
                        <p className="billing-muted">{t('account.billing.noDetails')}</p>
                    )}
                </div>
            </div>

            <div className="card billing-card">
                <div className="billing-card-header">
                    <h3>{t('account.billing.invoices')}</h3>
                </div>
                <div className="billing-table-wrapper">
                    <table className="billing-table">
                        <thead>
                        <tr>
                            <th>{t('account.billing.order')}</th>
                            <th>{t('account.billing.id')}</th>
                            <th>{t('account.billing.date')}</th>
                            <th>{t('account.billing.amount')}</th>
                            <th>{t('account.billing.invoice')}</th>
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
                                    {t('account.billing.noInvoices')}
                                </td>
                            </tr>
                        )}
                        {!invoicesLoading && !invoicesError && invoices.map((invoice) => (
                            <tr key={invoice.id}>
                                {/* См. AccountOverviewPage: имена ячеек нужны карточной
                                    раскладке на узком экране. */}
                                <td className="billing-cell-order">#{invoice.orderId}</td>
                                <td className="billing-cell-id">{invoice.id}</td>
                                <td className="billing-cell-date">{formatDate(invoice.date)}</td>
                                <td className="billing-cell-amount">
                                    {invoice.amount.toFixed(2)} {invoice.currency.toUpperCase()}
                                </td>
                                <td className="billing-cell-action">
                                    <button
                                        type="button"
                                        className="btn btn-outline billing-download-btn"
                                        onClick={() => handleDownloadInvoice(invoice)}
                                        disabled={!invoice.pdfAvailable || isDownloadingInvoice === invoice.id}
                                    >
                                        {isDownloadingInvoice === invoice.id ? t('common.downloading') : t('account.billing.downloadPdf')}
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
                            aria-label={t('common.previousPage')}
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
                            aria-label={t('common.nextPage')}
                            onClick={() => setInvoicePage((prev) => Math.min(invoiceTotalPages, prev + 1))}
                            disabled={invoicePage === invoiceTotalPages}
                        >
                            <FontAwesomeIcon icon={faChevronRight} />
                        </button>
                    </div>
                    <span className="billing-pagination-note">
                        {invoiceTotalCount === 0
                            ? t('common.showingZero')
                            : t('common.showingRange', { from: (invoicePage - 1) * invoicePageSize + 1, to: Math.min(invoicePage * invoicePageSize, invoiceTotalCount), total: invoiceTotalCount })}
                    </span>
                </div>
            </div>

            <div className="card billing-card billing-privacy-card">
                <div className="billing-card-header">
                    <h3>{t('account.billing.privacy')}</h3>
                </div>
                <div className="billing-privacy-row">
                    <label className="billing-checkbox">
                        <input
                            type="checkbox"
                            checked={profileDraft?.hideOwnedGamesInProfile ?? false}
                            onChange={(event) => handleProfileChange({ hideOwnedGamesInProfile: event.target.checked })}
                            disabled={profileLoading}
                        />
                        {t('account.billing.hideOwned')}
                    </label>
                    <button
                        type="button"
                        className="btn btn-outline billing-download-btn"
                        onClick={handleDownloadData}
                        disabled={isDownloadingData}
                    >
                        {isDownloadingData ? t('common.preparing') : t('account.billing.downloadData')}
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
                            <h3>{t('account.billing.editDetails')}</h3>
                            <p className="billing-modal-subtitle">{t('account.billing.editDetailsText')}</p>
                            <div className="billing-card-form">
                                <label className="billing-field">
                                    <span>{t('account.billing.addressLine')}</span>
                                    <input
                                        className="billing-input"
                                        type="text"
                                        value={profileDraft?.billingDetails?.addressLine1 ?? ''}
                                        onChange={(event) => handleBillingDetailsChange({ addressLine1: event.target.value })}
                                    />
                                </label>
                                <div className="billing-form-row">
                                    <label className="billing-field">
                                        <span>{t('account.billing.city')}</span>
                                        <input
                                            className="billing-input"
                                            type="text"
                                            value={profileDraft?.billingDetails?.city ?? ''}
                                            onChange={(event) => handleBillingDetailsChange({ city: event.target.value })}
                                        />
                                    </label>
                                    <label className="billing-field">
                                        <span>{t('account.billing.postalCode')}</span>
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
                                        <span>{t('account.billing.country')}</span>
                                        <input
                                            className="billing-input"
                                            type="text"
                                            value={profileDraft?.billingDetails?.country ?? ''}
                                            onChange={(event) => handleBillingDetailsChange({ country: event.target.value })}
                                        />
                                    </label>
                                    <label className="billing-field">
                                        <span>{t('account.billing.phone')}</span>
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
                                    {t('common.cancel')}
                                </button>
                                <button type="button" className="btn btn-primary" onClick={() => {
                                    setIsBillingDetailsOpen(false);
                                    handleSaveProfile();
                                }}>
                                    {t('common.save')}
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
