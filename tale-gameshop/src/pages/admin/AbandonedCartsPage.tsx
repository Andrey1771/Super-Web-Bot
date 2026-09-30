import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import { DataGrid, Column, Paging, Scrolling } from "../../components/grid";
import { GRID_PAGE_SIZE } from "../../hooks/use-grid-window";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import {
  getAbandonedCarts,
  remindAbandonedCarts,
  type AbandonedCartsReport,
  type ReminderResult,
} from "../../api/adminReportsApi";
import { formatMoney } from "../../utils/format-money";

/**
 * Брошенные корзины: товар выбран, деньги не заплачены.
 *
 * Единственный отчёт, который показывает не прошлое, а упущенное, — деньги, до которых
 * покупатель почти дошёл. Периода здесь нет: вопрос «что висит прямо сейчас», а не «что
 * висело в прошлом месяце».
 *
 * Напоминания уходят только отсюда и только по отмеченным строкам. Ни расписания, ни
 * фоновой рассылки: письмо получает живой человек, который ничего не заказывал, и решение
 * написать ему принимает не таймер.
 */

/** Сколько часов простоя считать «брошенной». Меньше часа ловит тех, кто просто отошёл. */
const IDLE_PRESETS = [1, 4, 24, 72];

/** Как объяснить исход отправки по каждой строке. */
const STATUS_TEXT: Record<string, string> = {
  sent: "sent",
  already_reminded: "skipped — already reminded about this cart",
  unsubscribed: "skipped — unsubscribed from e-mail",
  no_address: "skipped — guest cart, no address",
  cart_empty: "skipped — the cart is empty now",
  failed: "failed to send",
};

const AbandonedCartsPage: React.FC = () => {
  const { setPageTitle } = useAdminHeader();
  const [idleHours, setIdleHours] = useState(4);
  const [report, setReport] = useState<AbandonedCartsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<ReminderResult[] | null>(null);

  useEffect(() => setPageTitle("Abandoned carts"), [setPageTitle]);

  const load = useCallback(async (hours: number) => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getAbandonedCarts(hours));
    } catch (err: any) {
      setReport(null);
      setError(err?.response?.data?.message ?? "Failed to build the report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelected([]);
    setResults(null);
    load(idleHours);
  }, [load, idleHours]);

  const money = (value: number) => formatMoney(value, report?.baseCurrency ?? "USD");

  /** Написать можно только тому, у кого есть адрес и кому по этой корзине ещё не писали. */
  const writable = useMemo(
    () => (report?.rows ?? []).filter((row) => row.contactable && !row.remindedAtUtc && row.userId),
    [report],
  );

  /**
   * Строки для таблицы. У гостевой корзины нет userId, поэтому ключ строки собираем сами:
   * гриду нужен свой идентификатор, иначе гостевые строки склеятся в одну.
   */
  const gridRows = useMemo(
    () => (report?.rows ?? []).map((row) => ({ ...row, rowKey: `${row.userId ?? "guest"}-${row.updatedAtUtc}` })),
    [report],
  );

  const toggle = (userId: string) =>
    setSelected((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));

  const send = async () => {
    if (selected.length === 0) {
      return;
    }
    // Отправка необратима: письмо уже нельзя отозвать, поэтому спрашиваем до, а не после.
    const confirmed = window.confirm(
      `Send a cart reminder to ${selected.length} customer(s)? E-mails cannot be recalled.`,
    );
    if (!confirmed) {
      return;
    }

    setSending(true);
    setError(null);
    try {
      const outcome = await remindAbandonedCarts(selected);
      setResults(outcome);
      setSelected([]);
      await load(idleHours);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to send the reminders.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-grid">
      <PageHeader
        title="Abandoned carts"
        description="Carts left with items in them and no payment."
        breadcrumbs={["Reports", "Abandoned carts"]}
      />

      <div className="admin-card">
        <div className="admin-card__body">
          <span className="field-label">Idle for at least</span>
          <div className="report-presets">
            {IDLE_PRESETS.map((hours) => (
              <button
                key={hours}
                type="button"
                className={`btn btn-small ${hours === idleHours ? "btn-primary" : "btn-outline"}`}
                disabled={loading || sending}
                onClick={() => setIdleHours(hours)}
              >
                {hours < 24 ? `${hours} h` : `${hours / 24} d`}
              </button>
            ))}
          </div>
          {/* Корзина считается брошенной, только если после последнего изменения человек ничего
              не оплатил: иначе в списке оказались бы все, кто только что успешно купил. */}
          <p className="editor-pick__hint">
            A cart counts as abandoned when it has not changed for this long and its owner has not
            paid since. Buyers who completed an order are excluded.
          </p>
        </div>
      </div>

      {error && <div className="admin-card"><div className="admin-card__body">{error}</div></div>}

      {report && !error && (
        <>
          <div className="report-tiles">
            <div className="report-tile report-tile--total">
              <span className="report-tile__label">Left in carts</span>
              <strong className="report-tile__value">{money(report.totals.value)}</strong>
              <span className="report-tile__note">
                {report.totals.carts} cart(s), {report.totals.items} item(s)
              </span>
            </div>
            <div className="report-tile">
              <span className="report-tile__label">Reachable</span>
              <strong className="report-tile__value">
                {report.totals.contactable} / {report.totals.carts}
              </strong>
              {/* У гостя идентификатор анонимный — писать некуда, и это видно сразу. */}
              <span className="report-tile__note">carts with a known e-mail</span>
            </div>
            <div className="report-tile">
              <span className="report-tile__label">Already reminded</span>
              <strong className="report-tile__value">{report.totals.reminded}</strong>
              <span className="report-tile__note">one reminder per cart, never repeated</span>
            </div>
          </div>

          {report.totals.cartsWithoutTimestamp > 0 && (
            <div className="card-completeness">
              <div className="card-completeness__head">
                <strong>Some carts cannot be judged</strong>
              </div>
              <ul className="card-completeness__list">
                <li className="card-completeness__item card-completeness__item--info">
                  <span className="card-completeness__pill">No timestamp</span>
                  <span>
                    {report.totals.cartsWithoutTimestamp} cart(s) predate change tracking — there is
                    no way to tell how long they have been sitting. They appear here once touched again.
                  </span>
                </li>
              </ul>
            </div>
          )}

          {results && (
            <div className="card-completeness">
              <div className="card-completeness__head">
                <strong>Reminders</strong>
              </div>
              <ul className="card-completeness__list">
                {results.map((result) => (
                  <li
                    key={result.userId}
                    className={`card-completeness__item ${
                      result.status === "sent" ? "" : "card-completeness__item--info"
                    }`}
                  >
                    <span className="card-completeness__pill">{result.status === "sent" ? "Sent" : "Skipped"}</span>
                    <span>
                      {result.userId} — {STATUS_TEXT[result.status] ?? result.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="admin-card">
            <div className="admin-card__body">
              {report.rows.length === 0 ? (
                <p className="editor-pick__hint">Nothing abandoned right now.</p>
              ) : (
                <>
                  <div className="spend-panel__head">
                    <span className="field-label">
                      {selected.length > 0
                        ? `${selected.length} selected`
                        : `${writable.length} cart(s) can be reminded`}
                    </span>
                    <div className="report-presets">
                      <button
                        type="button"
                        className="btn btn-outline btn-small"
                        disabled={sending || writable.length === 0}
                        onClick={() =>
                          setSelected(
                            selected.length === writable.length ? [] : writable.map((row) => row.userId as string),
                          )
                        }
                      >
                        {selected.length === writable.length && writable.length > 0 ? "Clear" : "Select all"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        disabled={sending || selected.length === 0}
                        onClick={send}
                      >
                        {sending ? "Sending…" : "Send reminder"}
                      </button>
                    </div>
                  </div>

                  {/* Отчёт приходит целиком — сервер его не листает. Виртуальная прокрутка
                      нужна затем, чтобы в DOM жили только видимые строки: брошенных корзин
                      бывает много. Отметки остаются своими: отмечать можно не всякую строку. */}
                  <DataGrid
                    dataSource={gridRows}
                    keyExpr="rowKey"
                    showBorders
                    showRowLines
                    height={480}
                    width="100%"
                    columnAutoWidth
                    allowColumnResizing
                    columnResizingMode="widget"
                    noDataText="Nothing abandoned right now."
                  >
                    <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
                    <Paging enabled pageSize={GRID_PAGE_SIZE} />

                    <Column
                      caption=""
                      width={50}
                      allowSorting={false}
                      cellRender={(cell) => {
                        const row = cell.data;
                        const canRemind = row.contactable && !row.remindedAtUtc && !!row.userId;
                        return (
                          <input
                            type="checkbox"
                            checked={!!row.userId && selected.includes(row.userId)}
                            disabled={!canRemind || sending}
                            onChange={() => row.userId && toggle(row.userId)}
                          />
                        );
                      }}
                    />
                    <Column
                      dataField="userId"
                      caption="Customer"
                      minWidth={220}
                      cellRender={(cell) => (
                        <span>
                          {cell.data.userId || "—"}
                          {!cell.data.contactable && (
                            <span className="report-table__gone" title="Guest cart — no e-mail to write to"> · guest</span>
                          )}
                        </span>
                      )}
                    />
                    <Column dataField="items" caption="Items" width={100} alignment="right" />
                    <Column
                      dataField="value"
                      caption="Value"
                      width={140}
                      alignment="right"
                      cellRender={(cell) => <span>{money(cell.data.value)}</span>}
                    />
                    <Column
                      dataField="idleHours"
                      caption="Idle"
                      width={110}
                      alignment="right"
                      cellRender={(cell) => (
                        <span>
                          {cell.data.idleHours < 48 ? `${cell.data.idleHours} h` : `${Math.floor(cell.data.idleHours / 24)} d`}
                        </span>
                      )}
                    />
                    <Column
                      caption="Reminder"
                      minWidth={180}
                      allowSorting={false}
                      cellRender={(cell) =>
                        cell.data.remindedAtUtc ? (
                          <span className="report-table__gone">
                            sent {new Date(cell.data.remindedAtUtc).toLocaleDateString()}
                          </span>
                        ) : cell.data.contactable ? (
                          <span>—</span>
                        ) : (
                          <span className="report-table__gone">nowhere to write</span>
                        )
                      }
                    />
                  </DataGrid>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AbandonedCartsPage;
