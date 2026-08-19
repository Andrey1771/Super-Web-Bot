import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useKeycloak } from "@react-keycloak/web";
import PageHeader from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { useToast } from "../../components/ui/ToastProvider";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import {
  blockCustomer,
  getCustomer,
  searchCustomers,
  sendCustomerPasswordReset,
  unblockCustomer,
  type CustomerCard,
  type CustomerSearchHit,
} from "../../api/adminCustomersApi";
import { formatMoney } from "../../utils/format-money";
import "./customers-page.css";

/**
 * Клиенты: поиск и карточка. Всё, что магазин знает о человеке, — заказы, ключи, обращения,
 * промокоды, статус учётки — на одном экране. Раньше пункт «Users» вёл на лог входов Keycloak,
 * и специалисту, к которому пришёл клиент, смотреть там было нечего.
 *
 * Адрес карточки — ?email=…, чтобы из чата и тикетов можно было прийти прямой ссылкой.
 */

const SEARCH_DEBOUNCE_MS = 350;

const ago = (value?: string): string => {
  if (!value) {
    return "—";
  }
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms)) {
    return "—";
  }
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) {
    return "today";
  }
  if (days < 30) {
    return `${days} d ago`;
  }
  if (days < 365) {
    return `${Math.floor(days / 30)} mo ago`;
  }
  return `${Math.floor(days / 365)} y ago`;
};

const CustomersPage: React.FC = () => {
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const { addToast } = useToast();
  const { keycloak } = useKeycloak();
  const [searchParams, setSearchParams] = useSearchParams();

  // @ts-ignore Тип токена Keycloak шире объявленного
  const roles: string[] = useMemo(() => [...(keycloak.tokenParsed?.resource_access?.["tale-shop-app"]?.roles ?? []), ...(keycloak.tokenParsed?.realm_access?.roles ?? [])], [keycloak.tokenParsed]);
  const isAdmin = roles.includes("admin");

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [hits, setHits] = useState<CustomerSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [card, setCard] = useState<CustomerCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedEmail = searchParams.get("email");

  useEffect(() => {
    setPageTitle("Customers");
    setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

  // Поиск с задержкой: Keycloak за каждой буквой дёргать незачем.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const result = await searchCustomers(trimmed);
        if (!cancelled) {
          setHits(result);
        }
      } catch (err) {
        console.error("Customer search failed", err);
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const loadCard = useCallback(async (email: string) => {
    setCardLoading(true);
    setCardError(null);
    try {
      setCard(await getCustomer(email));
    } catch (err: any) {
      console.error("Customer card failed", err);
      setCard(null);
      setCardError(err?.response?.status === 404 ? "No account, orders or support history for this e-mail." : "Failed to load the customer.");
    } finally {
      setCardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEmail) {
      loadCard(selectedEmail);
    } else {
      setCard(null);
    }
  }, [loadCard, selectedEmail]);

  const select = (email: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("email", email);
    if (query.trim()) {
      next.set("q", query.trim());
    }
    setSearchParams(next, { replace: true });
  };

  const run = async (action: () => Promise<{ ok: boolean; message: string }>) => {
    if (!selectedEmail) {
      return;
    }
    setBusy(true);
    try {
      const result = await action();
      addToast(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        await loadCard(selectedEmail);
      }
    } catch (err) {
      console.error("Customer action failed", err);
      addToast("Action failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const spent = card
    ? Object.entries(card.spentByCurrency).map(([currency, amount]) => formatMoney(amount, currency)).join(" · ") || "—"
    : "—";

  return (
    <div className="admin-grid customers">
      <PageHeader
        title="Customers"
        description="Search a customer by e-mail or name and see their orders, keys and support history in one place."
        breadcrumbs={["Users", "Customers"]}
      />

      <div className="customers__layout">
        <Card>
          <input
            className="w-full p-2 border rounded"
            type="search"
            placeholder="E-mail, name or part of it…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="customers__hits">
            {searching && <p className="customers__muted">Searching…</p>}
            {!searching && query.trim().length >= 2 && hits.length === 0 && <p className="customers__muted">Nobody found.</p>}
            {hits.map((hit) => (
              <button
                key={hit.email}
                type="button"
                className={`customers__hit${hit.email === selectedEmail ? " customers__hit--active" : ""}`}
                onClick={() => select(hit.email)}
              >
                <span className="customers__hit-email">{hit.email}</span>
                <span className="customers__hit-meta">
                  {hit.name ? `${hit.name} · ` : ""}
                  {hit.orderCount} order{hit.orderCount === 1 ? "" : "s"}
                  {hit.source === "guest" ? " · guest" : hit.enabled === false ? " · blocked" : ""}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <div className="customers__card">
          {!selectedEmail ? (
            <EmptyState title="Pick a customer" description="Search on the left, or open a customer from a chat or ticket." />
          ) : cardLoading && !card ? (
            <Card><div className="skeleton h-24" /></Card>
          ) : cardError ? (
            <EmptyState title="Not found" description={cardError} />
          ) : card ? (
            <>
              <Card>
                <div className="customers__head">
                  <div>
                    <h2 className="customers__email">{card.email}</h2>
                    <p className="customers__muted">
                      {card.name ? `${card.name} · ` : ""}
                      {card.profileUnavailable
                        ? "account status unknown (Keycloak unavailable)"
                        : card.keycloakId
                          ? `${card.enabled === false ? "blocked" : "active"} account${card.emailVerified === false ? " · e-mail not verified" : ""}`
                          : "guest — no account"}
                      {card.registeredAt ? ` · registered ${ago(card.registeredAt)}` : ""}
                      {card.lastLoginAt ? ` · last login ${ago(card.lastLoginAt)}` : ""}
                    </p>
                  </div>
                  {isAdmin && card.keycloakId && (
                    <div className="customers__actions">
                      {card.enabled === false ? (
                        <button className="btn btn-outline" disabled={busy} onClick={() => run(() => unblockCustomer(card.email))}>Unblock</button>
                      ) : (
                        <button className="btn btn-outline customers__danger" disabled={busy} onClick={() => run(() => blockCustomer(card.email))}>Block</button>
                      )}
                      <button className="btn btn-outline" disabled={busy} onClick={() => run(() => sendCustomerPasswordReset(card.email))}>Send password reset</button>
                    </div>
                  )}
                </div>
                <div className="customers__stats">
                  <div><span className="customers__stat-value">{card.paidOrderCount}</span><span className="customers__stat-label">paid orders</span></div>
                  <div><span className="customers__stat-value">{spent}</span><span className="customers__stat-label">spent</span></div>
                  <div><span className="customers__stat-value">{card.keyCount}</span><span className="customers__stat-label">keys</span></div>
                  <div><span className="customers__stat-value">{card.ticketCount + card.chatCount}</span><span className="customers__stat-label">support contacts</span></div>
                  {card.refundedOrderCount > 0 && (
                    <div><span className="customers__stat-value customers__stat-value--warn">{card.refundedOrderCount}</span><span className="customers__stat-label">refunded</span></div>
                  )}
                </div>
              </Card>

              <Card>
                <div className="customers__section-head">
                  <h3>Orders</h3>
                  <Link className="customers__link" to={`/admin/orders?search=${encodeURIComponent(card.email)}`}>All {card.orderCount} in Orders →</Link>
                </div>
                {card.recentOrders.length === 0 ? (
                  <p className="customers__muted">No orders.</p>
                ) : (
                  <table className="admin-table customers__table">
                    <thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
                    <tbody>
                      {card.recentOrders.map((o) => (
                        <tr key={o.id}>
                          <td><Link className="customers__link" to={`/admin/orders?search=${encodeURIComponent(o.number)}`}>{o.number}</Link></td>
                          <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                          <td className="customers__items" title={o.items.join(", ")}>{o.items.join(", ") || "—"}</td>
                          <td>{formatMoney(o.total, o.currency)}</td>
                          <td><span className={`customers__status customers__status--${o.status.toLowerCase()}`}>{o.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              <div className="admin-grid admin-grid--2">
                <Card>
                  <div className="customers__section-head">
                    <h3>Support</h3>
                    <Link className="customers__link" to={`/admin/support/live-chat?q=${encodeURIComponent(card.email)}`}>Chats →</Link>
                  </div>
                  {card.recentTickets.length === 0 && card.recentChats.length === 0 ? (
                    <p className="customers__muted">Never wrote to support.</p>
                  ) : (
                    <ul className="customers__list">
                      {card.recentTickets.map((t) => (
                        <li key={t.id}>
                          <Link className="customers__link" to={`/admin/support/tickets?ticket=${encodeURIComponent(t.id)}`}>{t.publicId}</Link>
                          {" "}· {t.subject} <span className="customers__muted">· {t.status} · {ago(t.lastMessageAt)}</span>
                        </li>
                      ))}
                      {card.recentChats.map((c) => (
                        <li key={c.id}>
                          <Link className="customers__link" to={`/admin/support/live-chat?session=${encodeURIComponent(c.id)}`}>chat #{c.id.slice(-6).toUpperCase()}</Link>
                          {" "}<span className="customers__muted">· {c.status} · {ago(c.lastMessageAt)}</span>
                          {c.summary && <div className="customers__summary">{c.summary}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card>
                  <h3>Keys &amp; promo</h3>
                  {card.recentKeys.length === 0 ? (
                    <p className="customers__muted">No keys issued.</p>
                  ) : (
                    <ul className="customers__list">
                      {card.recentKeys.map((k, i) => (
                        <li key={`${k.masked}-${i}`}>
                          <span className="font-mono">{k.masked}</span>
                          <span className="customers__muted"> · {k.keyType ?? "key"} · {new Date(k.issuedAt).toLocaleDateString()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {card.promoCodesUsed.length > 0 && (
                    <p className="customers__muted customers__promo">Promo codes used: {card.promoCodesUsed.join(", ")}</p>
                  )}
                </Card>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default CustomersPage;
