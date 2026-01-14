import React, {useEffect, useMemo, useState} from "react";
import {Link} from "react-router-dom";
import {useKeycloak} from "@react-keycloak/web";
import AccountShell from "../components/AccountShell";
import type {AccountOverview} from "../types";
import {downloadInvoice, getAccountOverview} from "../services/accountApi";
import container from "../../../inversify.config";
import type {IKeycloakAuthService} from "../../../iterfaces/i-keycloak-auth-service";
import IDENTIFIERS from "../../../constants/identifiers";

const formatDate = (value?: string | null) => {
    if (!value) {
        return "—";
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
};

const formatAmount = (amount?: number | null, currency?: string | null) => {
    if (amount === null || amount === undefined) {
        return "—";
    }
    if (!currency) {
        return amount.toFixed(2);
    }
    return new Intl.NumberFormat(undefined, {style: "currency", currency}).format(amount);
};

const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
        const parts = name.split(" ").filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    }
    if (email) {
        return email.slice(0, 2).toUpperCase();
    }
    return "AC";
};

export default function AccountOverviewPage() {
    const {keycloak} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);
    const [overview, setOverview] = useState<AccountOverview | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [invoiceError, setInvoiceError] = useState<string | null>(null);
    const [invoiceLoading, setInvoiceLoading] = useState<Record<string, boolean>>({});

    const retryFetch = () => {
        setError(null);
        setIsLoading(true);
        getAccountOverview()
            .then((data) => {
                setOverview(data);
            })
            .catch((err) => {
                if (err?.response?.status === 401) {
                    keycloakAuthService.loginWithRedirect(keycloak, window.location.href);
                }
                setError("Не удалось загрузить данные аккаунта.");
            })
            .finally(() => {
                setIsLoading(false);
            });
    };

    useEffect(() => {
        let isActive = true;
        getAccountOverview()
            .then((data) => {
                if (isActive) {
                    setOverview(data);
                }
            })
            .catch((err) => {
                if (err?.response?.status === 401) {
                    keycloakAuthService.loginWithRedirect(keycloak, window.location.href);
                }
                if (isActive) {
                    setError("Не удалось загрузить данные аккаунта.");
                }
            })
            .finally(() => {
                if (isActive) {
                    setIsLoading(false);
                }
            });

        return () => {
            isActive = false;
        };
    }, [keycloak, keycloakAuthService]);

    const profile = overview?.user;
    const counters = overview?.counters;

    const actions = useMemo(() => ([
        {label: "Orders", count: counters?.ordersCount, to: "/account/orders"},
        {label: "Keys & activation", count: counters?.activeKeysCount, to: "/account/keys"},
        {label: "Saved items", count: counters?.savedItemsCount, to: "/account/saved"},
        {label: "Billing", count: counters?.paymentMethodsCount, to: "/account/billing"}
    ]), [counters]);

    const handleInvoiceClick = async (orderId: string) => {
        setInvoiceError(null);
        setInvoiceLoading((prev) => ({...prev, [orderId]: true}));
        try {
            const blob = await downloadInvoice(orderId);
            const url = window.URL.createObjectURL(blob);
            window.open(url, "_blank", "noopener,noreferrer");
            setTimeout(() => window.URL.revokeObjectURL(url), 5000);
        } catch (err) {
            setInvoiceError("Не удалось открыть инвойс. Попробуйте позже.");
        } finally {
            setInvoiceLoading((prev) => ({...prev, [orderId]: false}));
        }
    };

    return (
        <AccountShell
            title="Account overview"
            section="Overview"
            subtitle="Manage your purchases, keys, and account settings."
        >
            {error && (
                <div className="account-error">
                    <span>{error}</span>
                    <button className="btn btn-outline" type="button" onClick={retryFetch}>
                        Retry
                    </button>
                </div>
            )}

            <div className="account-card">
                {isLoading ? (
                    <div className="account-profile">
                        <div className="account-profile-info">
                            <div className="account-avatar account-skeleton" style={{width: 64, height: 64}}></div>
                            <div>
                                <div className="account-skeleton account-skeleton-line" style={{width: 140}}></div>
                                <div className="account-skeleton account-skeleton-line" style={{width: 180}}></div>
                            </div>
                        </div>
                        <div className="account-skeleton" style={{width: 140, height: 40}}></div>
                    </div>
                ) : (
                    <div className="account-profile">
                        <div className="account-profile-info">
                            <div className="account-avatar">
                                {getInitials(profile?.displayName, profile?.email)}
                            </div>
                            <div className="account-meta">
                                <strong>{profile?.displayName || profile?.email || ""}</strong>
                                <span>{profile?.email || ""}</span>
                                {profile?.verifiedBuyer && <span className="badge">Verified buyer</span>}
                                <span>Member since {formatDate(profile?.memberSince)}</span>
                            </div>
                        </div>
                        <Link className="btn btn-primary" to="/account/settings">Edit profile</Link>
                    </div>
                )}
            </div>

            <div className="account-actions-grid">
                {isLoading ? (
                    Array.from({length: 4}).map((_, index) => (
                        <div key={index} className="account-action-card">
                            <div style={{flex: 1}}>
                                <div className="account-skeleton account-skeleton-line" style={{width: 120}}></div>
                                <div className="account-skeleton account-skeleton-line" style={{width: 80}}></div>
                            </div>
                            <div className="account-skeleton" style={{width: 32, height: 32}}></div>
                        </div>
                    ))
                ) : (
                    actions.map((item) => (
                        <Link key={item.label} to={item.to} className="account-action-card">
                            <div>
                                <div className="account-action-title">{item.label}</div>
                                <div className="account-muted">Quick access</div>
                            </div>
                            <div className="account-action-count">{item.count ?? 0}</div>
                        </Link>
                    ))
                )}
            </div>

            <div className="account-card">
                <div className="account-section-header">
                    <h3>Recent orders</h3>
                    <Link className="btn btn-link" to="/account/orders">View all orders</Link>
                </div>
                {isLoading ? (
                    <div>
                        {Array.from({length: 4}).map((_, index) => (
                            <div key={index} className="account-skeleton account-skeleton-row"></div>
                        ))}
                    </div>
                ) : overview?.recentOrders?.length ? (
                    <table className="account-table">
                        <thead>
                        <tr>
                            <th>Order ID</th>
                            <th>Game</th>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Invoice</th>
                        </tr>
                        </thead>
                        <tbody>
                        {overview.recentOrders.map((order) => (
                            <tr key={order.orderId}>
                                <td>#{order.orderId}</td>
                                <td>{order.gameTitle}</td>
                                <td>{formatDate(order.date)}</td>
                                <td>{formatAmount(order.amount, order.currency)}</td>
                                <td>
                                    <button
                                        className="btn btn-outline"
                                        type="button"
                                        disabled={!order.invoiceId || invoiceLoading[order.orderId]}
                                        onClick={() => handleInvoiceClick(order.orderId)}
                                    >
                                        {invoiceLoading[order.orderId] ? "Loading" : "View"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="account-empty">No recent orders yet.</div>
                )}
                {invoiceError && <div className="account-muted" style={{marginTop: "12px"}}>{invoiceError}</div>}
            </div>

            <div className="account-card">
                <div className="account-section-header">
                    <h3>Recent keys</h3>
                    <Link className="btn btn-link" to="/account/keys">View all keys</Link>
                </div>
                {isLoading ? (
                    <div>
                        {Array.from({length: 2}).map((_, index) => (
                            <div key={index} className="account-skeleton account-skeleton-row"></div>
                        ))}
                    </div>
                ) : overview?.recentKeys?.length ? (
                    <div className="account-keys-list">
                        {overview.recentKeys.map((keyItem) => (
                            <div key={keyItem.keyId ?? keyItem.gameTitle} className="account-key-row">
                                <div>
                                    <strong>{keyItem.gameTitle}</strong>
                                    <div className="account-muted">
                                        {keyItem.platform || ""} · {formatDate(keyItem.purchaseDate)}
                                    </div>
                                </div>
                                <Link className="btn btn-outline" to="/account/keys">View keys</Link>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="account-empty">No keys yet.</div>
                )}
            </div>

            {overview?.recommendations && overview.recommendations.length > 0 ? (
                <div className="account-card">
                    <div className="account-section-header">
                        <h3>Recommendations</h3>
                    </div>
                    <div className="account-muted">We will tailor recommendations based on your wishlist.</div>
                </div>
            ) : (
                <div className="account-card">
                    <div className="account-section-header">
                        <h3>Recommendations</h3>
                    </div>
                    <div className="account-empty">No recommendations yet.</div>
                </div>
            )}
        </AccountShell>
    );
}
