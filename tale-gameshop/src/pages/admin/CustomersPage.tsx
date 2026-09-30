import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REMOTE_PAGING } from "../../hooks/use-grid-window";
import "devextreme/dist/css/dx.light.css";
import { DataGrid } from "devextreme-react";
import { Column, Paging, Scrolling, Sorting } from "devextreme-react/data-grid";
import CustomStore from "devextreme/data/custom_store";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useKeycloak } from "@react-keycloak/web";
import PageHeader from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import Drawer from "../../components/ui/Drawer";
import EmptyState from "../../components/ui/EmptyState";
import { useToast } from "../../components/ui/ToastProvider";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import {
  blockCustomer,
  getCustomer,
  browseCustomers,
  exportCustomersCsv,
  searchCustomers,
  type CustomerBrowseFilter,
  sendCustomerPasswordReset,
  unblockCustomer,
  type CustomerCard,
  type CustomerSearchHit,
} from "../../api/adminCustomersApi";
import { formatMoney } from "../../utils/format-money";
import CustomerCashbackCard from "../../components/admin/CustomerCashbackCard";
import "./customers-page.css";

/**
 * Клиенты: поиск и карточка. Всё, что магазин знает о человеке, — заказы, ключи, обращения,
 * промокоды, статус учётки — на одном экране. Раньше пункт «Users» вёл на лог входов Keycloak,
 * и специалисту, к которому пришёл клиент, смотреть там было нечего.
 *
 * Адрес карточки — ?email=…, чтобы из чата и тикетов можно было прийти прямой ссылкой.
 */

const SEARCH_DEBOUNCE_MS = 350;
/** Сколько покупателей тянуть за одно окно прокрутки. */
const BROWSE_WINDOW = 50;

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

/** Срезы таблицы. Пять готовых вопросов, с которыми приходят на этот экран. */
const FILTERS: Array<{ value: CustomerBrowseFilter; label: string }> = [
  { value: "all", label: "All buyers (A–Z)" },
  { value: "recent", label: "Recently active" },
  { value: "refunded", label: "With refunds" },
  { value: "blocked", label: "Blocked" },
  { value: "no_orders", label: "No orders" },
];

// Старые заказы, где вместо почты записан идентификатор: клиента за таким не существует,
// карточку по нему не открыть — ведём сразу в заказы.
const LEGACY_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isLegacyId = (email: string) => LEGACY_ID_RE.test(email);

/** Один формат даты на таблицу и панель — раньше они показывали её по-разному. */
const formatDay = (value: string) => new Date(value).toLocaleDateString("ru-RU");

const CustomersPage: React.FC = () => {
  const { setPageTitle } = useAdminHeader();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { keycloak } = useKeycloak();
  const [searchParams, setSearchParams] = useSearchParams();

  // @ts-ignore Тип токена Keycloak шире объявленного
  const roles: string[] = useMemo(() => [...(keycloak.tokenParsed?.resource_access?.["tale-shop-app"]?.roles ?? []), ...(keycloak.tokenParsed?.realm_access?.roles ?? [])], [keycloak.tokenParsed]);
  const isAdmin = roles.includes("admin");
  // Собственный адрес — чтобы не предлагать заблокировать самого себя. Тот же признак
  // проверяет и сервер: спрятанной кнопки мало, запрос можно послать мимо интерфейса.
  const myEmail = ((keycloak.tokenParsed as { email?: string; preferred_username?: string } | undefined)?.email
    ?? (keycloak.tokenParsed as { preferred_username?: string } | undefined)?.preferred_username
    ?? "").toLowerCase();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  // Что реально ушло в таблицу: набранное в поле уезжает туда с задержкой, а не на каждую букву.
  const [appliedQuery, setAppliedQuery] = useState(searchParams.get("q") ?? "");
  const [card, setCard] = useState<CustomerCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<CustomerBrowseFilter>("all");
  const [exporting, setExporting] = useState(false);
  // Что показать под таблицей: сколько строк загружено, кончился ли список, была ли ошибка.
  const [gridMeta, setGridMeta] = useState({ loaded: 0, end: false, error: false });
  const loadedRef = useRef(0);
  const [reloadTick, setReloadTick] = useState(0);

  const selectedEmail = searchParams.get("email");

  // Курсор прокрутки: почта последней загруженной строки. Бесконечная прокрутка идёт только
  // вперёд, поэтому хранить достаточно одну точку; на первом окне (skip = 0) она сбрасывается.
  const cursor = useRef<string | null>(null);
  // Общее число строк среза приходит с первым окном; храним его, чтобы отдавать таблице
  // при каждой подгрузке — по нему она рисует полосу прокрутки нужной длины.
  const knownTotal = useRef<number | null>(null);

  const gridSource = useMemo(() => {
    cursor.current = null;
    loadedRef.current = 0;
    knownTotal.current = null;
    const needle = appliedQuery.trim();

    return new CustomStore({
      key: "email",
      load: async (options: { skip?: number; take?: number }) => {
        try {
          // С запросом — обычный поиск: он один умеет находить учётки без заказов, потому что
          // ходит ещё и в Keycloak. Отдаётся одной страницей: сузить запрос дешевле, чем
          // листать выдачу, а второе окно вернуло бы те же строки повторно.
          if (needle.length >= 2) {
            if (options.skip) {
              return { data: [], totalCount: loadedRef.current };
            }
            const rows = await searchCustomers(needle);
            loadedRef.current = rows.length;
            setGridMeta({ loaded: rows.length, end: true, error: false });
            // Поиск отдаётся одной страницей, поэтому найденное и есть всё количество.
            return { data: rows, totalCount: rows.length };
          }

          // Без запроса — выбранный срез, окнами по курсору.
          if (!options.skip) {
            cursor.current = null;
            loadedRef.current = 0;
          }
          const page = await browseCustomers(cursor.current, options.take ?? BROWSE_WINDOW, filter);
          cursor.current = page.nextCursor;
          loadedRef.current += page.items.length;
          if (page.total != null) {
            knownTotal.current = page.total;
          }
          setGridMeta({ loaded: loadedRef.current, end: page.nextCursor == null, error: false });

          // Таблице нужно общее число на каждой подгрузке: с первым окном оно приходит
          // с сервера, дальше отдаём запомненное. Когда его нет (срез по учёткам),
          // считаем по загруженному — до конца списка прокрутка всё равно дотянется.
          return {
            data: page.items,
            totalCount: knownTotal.current ?? (page.nextCursor ? loadedRef.current + 1 : loadedRef.current),
          };
        } catch (err) {
          // Грид покажет своё сообщение, а под таблицей появится объяснение и «Try again».
          setGridMeta((prev) => ({ ...prev, error: true }));
          throw err;
        }
      },
    });
  }, [appliedQuery, filter, reloadTick]);

  useEffect(() => {
    setPageTitle("Customers");
  }, [setPageTitle]);

  // Задержка перед тем, как отдать запрос таблице: Keycloak и базу за каждой буквой
  // дёргать незачем.
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Поле и адрес идут вместе. Раньше запрос попадал в адрес только при выборе клиента и
  // оставался там навсегда: крестик очищал поле, но не ссылку, и после обновления страницы
  // старый запрос возвращался.
  useEffect(() => {
    const trimmed = query.trim();
    const inUrl = searchParams.get("q") ?? "";
    if (trimmed === inUrl) {
      return;
    }

    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (trimmed) {
        next.set("q", trimmed);
      } else {
        next.delete("q");
      }
      setSearchParams(next, { replace: true });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query, searchParams, setSearchParams]);

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
    setSearchParams(next, { replace: true });
    // Карточка открывается над таблицей: если её выбрали, прокрутив список далеко вниз,
    // без этого человек остался бы смотреть на строки и решил, что ничего не произошло.
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Закрыть карточку: и на экране, и в адресе — иначе ссылка тянула бы за собой клиента,
  // которого уже посмотрели.
  const clearSelection = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("email");
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

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportCustomersCsv(filter, appliedQuery);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "customers.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Customers export failed", err);
      addToast("Export failed.", "error");
    } finally {
      setExporting(false);
    }
  };

  const isSearch = appliedQuery.trim().length >= 2;
  // Имя и статус учётки известны только там, где ответ собирался с участием Keycloak:
  // в поиске и в срезах по учёткам. В остальных срезах эти колонки показывали бы догадки.
  const accountColumnsVisible = isSearch || filter === "blocked" || filter === "no_orders";

  const isSelf = Boolean(card && myEmail && card.email.toLowerCase() === myEmail);

  const spent = card
    ? Object.entries(card.spentByCurrency).map(([currency, amount]) => formatMoney(amount, currency)).join(" · ") || "—"
    : "—";

  return (
    <div className="admin-grid customers">
      <PageHeader
        title="Customers"
        description="Search a customer by e-mail or name and see their orders, keys and support history in one place."
        breadcrumbs={["Customers"]}
      />

      {/* Один блок: поиск, который управляет таблицей, и сама таблица. Раньше поиск жил
          в отдельной колонке слева, результаты — справа, а список всех покупателей — под
          ними: три разных места про одно и то же, и пустая колонка, когда никто не выбран. */}
      <Card>
        <div className="customers__toolbar">
          <div>
            <h2 className="customers__browse-title">All customers</h2>
            <p className="customers__muted">
              Click a row to open the customer. Search matches any part of an e-mail or name
              and includes accounts without orders.
            </p>
          </div>
          <div className="customers__toolbar-actions">
            <input
              className="customers__search"
              type="search"
              placeholder="E-mail, name or part of it…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
            <button className="btn btn-outline" type="button" disabled={exporting} onClick={handleExport}>
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>

        {/* Срезы работают, пока поле поиска пусто: у поиска свой источник строк. */}
        <div className="customers__chips">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`customers__chip${filter === option.value && !isSearch ? " customers__chip--active" : ""}`}
              disabled={isSearch}
              title={isSearch ? "Clear the search to use slices" : undefined}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <DataGrid
          dataSource={gridSource}
          remoteOperations={REMOTE_PAGING}
          height={560}
          width="100%"
          showBorders={false}
          columnAutoWidth={true}
          hoverStateEnabled={true}
          noDataText={isSearch ? "Nobody found." : "Nothing in this slice."}
          onRowClick={(event) =>
            isLegacyId(event.data.email)
              ? navigate(`/admin/orders?search=${encodeURIComponent(event.data.email)}`)
              : select(event.data.email)
          }
        >
          {/* Строки приходят окнами с сервера — клик по заголовку отсортировал бы только
              загруженную часть и молча соврал. Пока сортировка не серверная, её нет. */}
          <Sorting mode="none" />
          {/* Виртуальная прокрутка: в DOM живут только видимые строки, окна приезжают
              по мере движения — так же, как на странице скидок. */}
          <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
          <Paging enabled={true} pageSize={BROWSE_WINDOW} />
          <Column
            dataField="email"
            caption="E-mail"
            cellRender={({ data }: { data: CustomerSearchHit }) =>
              isLegacyId(data.email)
                ? <span className="customers__muted">Legacy order — no e-mail (opens in Orders)</span>
                : <span>{data.email}</span>
            }
          />
          <Column dataField="name" caption="Name" visible={accountColumnsVisible} />
          <Column dataField="orderCount" caption="Orders" width={90} alignment="right" />
          <Column dataField="lastOrderAt" caption="Last order" dataType="date" format="dd.MM.yyyy" width={130} />
          <Column
            caption="Account"
            width={110}
            visible={accountColumnsVisible}
            calculateCellValue={(row: CustomerSearchHit) =>
              row.source === "account" ? (row.enabled === false ? "blocked" : "account") : "guest"
            }
          />
        </DataGrid>

        <div className="customers__grid-footer">
          {gridMeta.error ? (
            <>
              <span className="customers__muted">Failed to load the list.</span>
              <button className="btn btn-outline" type="button" onClick={() => setReloadTick((tick) => tick + 1)}>
                Try again
              </button>
            </>
          ) : (
            <span className="customers__muted">
              {gridMeta.loaded} loaded{gridMeta.end ? " · end of list" : " · scroll for more"}
            </span>
          )}
        </div>
      </Card>

      {/* Карточка — выезжающей панелью поверх таблицы: список остаётся на месте, а прямая
          ссылка с ?email= открывает панель сразу. */}
      <div className="customers-drawer">
        <Drawer isOpen={Boolean(selectedEmail)} title={selectedEmail ?? ""} onClose={clearSelection}>
          {cardLoading && !card ? (
            <Card><div className="skeleton h-24" /></Card>
          ) : cardError ? (
            <EmptyState title="Not found" description={cardError} />
          ) : card ? (
            <>
              <Card>
                <div className="customers__head">
                  <div>
                    {/* Адрес уже в заголовке панели — второй раз он тут был просто эхом. */}
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
                  <div className="customers__actions">
                    {isAdmin && card.keycloakId && (card.enabled === false ? (
                      <button className="btn btn-outline" disabled={busy} onClick={() => run(() => unblockCustomer(card.email))}>Unblock</button>
                    ) : (
                      <button
                        className="btn btn-outline customers__danger"
                        disabled={busy || isSelf}
                        title={isSelf ? "You cannot block your own account" : undefined}
                        onClick={() => {
                          // Блокировка отрубает человеку вход — промах мышью не должен этого делать.
                          if (window.confirm(`Block ${card.email}? They will not be able to sign in.`)) {
                            run(() => blockCustomer(card.email));
                          }
                        }}
                      >Block</button>
                    ))}
                    {isAdmin && card.keycloakId && (
                      <button
                        className="btn btn-outline"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Send a password reset e-mail to ${card.email}?`)) {
                            run(() => sendCustomerPasswordReset(card.email));
                          }
                        }}
                      >Send password reset</button>
                    )}
                  </div>
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
                          <td>{formatDay(o.createdAt)}</td>
                          <td className="customers__items" title={o.items.join(", ")}>{o.items.join(", ") || "—"}</td>
                          <td>{formatMoney(o.total, o.currency)}</td>
                          <td><span className={`customers__status customers__status--${o.status.toLowerCase()}`}>{o.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              {/* Кэшбэк — деньги, поэтому только администратору; сервер проверяет роль сам. */}
              {isAdmin && <CustomerCashbackCard email={card.email} />}

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
                          <span className="customers__muted"> · {k.keyType ?? "key"} · {formatDay(k.issuedAt)}</span>
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
        </Drawer>
      </div>
    </div>
  );
};

export default CustomersPage;
