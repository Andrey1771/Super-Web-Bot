import React, {useCallback, useEffect, useMemo, useState} from "react";
import {Link} from "react-router-dom";
import axios from "axios";
import {useKeycloak} from "@react-keycloak/web";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type {IKeycloakAuthService} from "../../../iterfaces/i-keycloak-auth-service";
import {downloadOrderInvoice, getAccountOverview} from "../services/accountApi";
import type {AccountOrder, AccountOverviewResponse} from "../types";

const formatDate = (value: string) =>
    new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric", year: "numeric"}).format(
        new Date(value)
    );

const formatAmount = (amount: number | null, currency: string | null) => {
    if (amount === null || !currency) {
        return "—";
    }

    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency
    }).format(amount);
};

const getInitials = (name: string) =>
    name
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

const AccountOverviewPage: React.FC = () => {
    const {keycloak} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);
    const [data, setData] = useState<AccountOverviewResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const fetchOverview = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await getAccountOverview();
            setData(response);
        } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 401) {
                await keycloakAuthService.loginWithRedirect(keycloak, window.location.href);
                return;
            }
            setError("We couldn't load your account overview right now.");
        } finally {
            setIsLoading(false);
        }
    }, [keycloak, keycloakAuthService]);

    useEffect(() => {
        fetchOverview();
    }, [fetchOverview]);

    const handleInvoiceDownload = async (order: AccountOrder) => {
        if (!order.invoiceId) {
            return;
        }

        try {
            setActionError(null);
            const blob = await downloadOrderInvoice(order.orderId);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `invoice-${order.orderId}.pdf`;
            link.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setActionError("Invoice is not available yet. Please try again later.");
        }
    };

    const summary = data?.counters;
    const user = data?.user;

    const orders = useMemo(() => data?.recentOrders ?? [], [data]);
    const keys = useMemo(() => data?.recentKeys ?? [], [data]);

    if (isLoading) {
        return (
            <>
                <div className="account-card account-profile-card">
                    <div className="account-profile-info">
                        <div className="skeleton skeleton-avatar"></div>
                        <div className="account-profile-meta" style={{minWidth: 180}}>
                            <div className="skeleton skeleton-line"></div>
                            <div className="skeleton skeleton-line" style={{width: "60%"}}></div>
                        </div>
                    </div>
                    <div className="skeleton skeleton-line" style={{width: 120, height: 40}}></div>
                </div>
                <div className="account-grid">
                    {Array.from({length: 4}).map((_, index) => (
                        <div key={index} className="account-card skeleton skeleton-card"></div>
                    ))}
                </div>
                <div className="account-card skeleton skeleton-table"></div>
                <div className="account-card skeleton skeleton-table"></div>
            </>
        );
    }

    if (error) {
        return (
            <div className="account-card">
                <div className="account-alert">{error}</div>
                <div style={{marginTop: 16}}>
                    <button className="btn btn-outline" type="button" onClick={fetchOverview}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!data || !user || !summary) {
        return (
            <div className="account-card account-empty">
                We couldn't find account data yet.
            </div>
        );
    }

    return (
        <>
            <div className="account-card account-profile-card">
                <div className="account-profile-info">
                    <div className="account-avatar">
                        {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt={user.displayName}/>
                        ) : (
                            getInitials(user.displayName || user.email)
                        )}
                    </div>
                    <div className="account-profile-meta">
                        <span className="account-profile-name">{user.displayName}</span>
                        <span className="account-profile-email">{user.email}</span>
                        {user.verifiedBuyer && <span className="badge">Verified buyer</span>}
                        <div className="account-profile-footer">
                            <span>Member since {formatDate(user.memberSince)}</span>
                        </div>
                    </div>
                </div>
                <Link className="btn btn-outline" to="/account/settings">
                    Edit profile
                </Link>
            </div>

            <div className="account-grid">
                <Link className="account-card account-action-card" to="/account/orders">
                    <span className="account-action-title">Orders</span>
                    <span className="account-action-meta">{summary.ordersCount} orders</span>
                </Link>
                <Link className="account-card account-action-card" to="/account/keys">
                    <span className="account-action-title">Keys &amp; activation</span>
                    <span className="account-action-meta">{summary.activeKeysCount} active keys</span>
                </Link>
                <Link className="account-card account-action-card" to="/account/saved">
                    <span className="account-action-title">Saved items</span>
                    <span className="account-action-meta">{summary.savedItemsCount} saved items</span>
                </Link>
                <Link className="account-card account-action-card" to="/account/billing">
                    <span className="account-action-title">Billing</span>
                    <span className="account-action-meta">{summary.paymentMethodsCount} payment methods</span>
                </Link>
            </div>

            <div className="account-card">
                <h2 className="account-section-title">Recent orders</h2>
                {actionError && <div className="account-alert" style={{marginBottom: 12}}>{actionError}</div>}
                {orders.length === 0 ? (
                    <div className="account-empty">No orders yet.</div>
                ) : (
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
                        {orders.map((order) => (
                            <tr key={order.orderId}>
                                <td>#{order.orderId}</td>
                                <td>{order.gameTitle}</td>
                                <td>{formatDate(order.date)}</td>
                                <td>{formatAmount(order.amount, order.currency)}</td>
                                <td>
                                    <button
                                        className="btn btn-outline account-table-button"
                                        type="button"
                                        disabled={!order.invoiceId}
                                        onClick={() => handleInvoiceDownload(order)}
                                    >
                                        {order.invoiceId ? "View invoice" : "Unavailable"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="account-card">
                <h2 className="account-section-title">Recent keys</h2>
                {keys.length === 0 ? (
                    <div className="account-empty">No keys available yet.</div>
                ) : (
                    <div className="account-list">
                        {keys.map((key) => (
                            <div className="account-list-item" key={key.keyId}>
                                <div className="account-list-meta">
                                    <span className="account-list-title">{key.gameTitle}</span>
                                    <span className="account-muted">
                                        {key.platform} · {formatDate(key.purchaseDate)}
                                    </span>
                                </div>
                                <Link className="btn btn-outline account-table-button" to="/account/keys">
                                    View keys
                                </Link>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
};

export default AccountOverviewPage;
