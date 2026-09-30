import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../ui/Card";
import { useToast } from "../ui/ToastProvider";
import { adjustCustomerCashback, getCustomerCashback, resumeCustomerCashbackEmails, type AdminCashbackEntry, type AdminCustomerCashback } from "../../api/adminCashbackApi";
import { formatMoney } from "../../utils/format-money";

/**
 * Кэшбэк покупателя в его карточке: баланс, уровень, журнал и ручная правка. Только для администратора —
 * сервер проверяет роль сам. Суммы в долларах: в них хранится баланс.
 */

const usd = (value: number) => formatMoney(value, "USD");

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

const TYPE_LABEL: Record<string, string> = {
  earn: "Earned",
  reversal: "Taken back (refund/dispute)",
  spend: "Paid with cashback",
  return: "Returned (refunded order)",
  adjust: "Manual adjustment",
};

const EMAIL_LABEL: Record<string, string> = {
  available: "Cashback is ready to use",
  expiring: "Cashback expires soon",
};

/** Знак записи для журнала: что ушло с баланса, а что пришло. */
const signed = (entry: AdminCashbackEntry) => {
  const outgoing = entry.type === "reversal" || entry.type === "spend";
  const amount = entry.type === "adjust" ? entry.amountUsd : outgoing ? -entry.amountUsd : entry.amountUsd;
  return `${amount < 0 ? "−" : "+"}${usd(Math.abs(amount))}`;
};

const CustomerCashbackCard: React.FC<{ email: string }> = ({ email }) => {
  const { addToast } = useToast();
  const [data, setData] = useState<AdminCustomerCashback | null>(null);
  const [error, setError] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"add" | "deduct">("add");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resumeReason, setResumeReason] = useState("");

  const load = useCallback(async () => {
    setError(false);
    try {
      setData(await getCustomerCashback(email));
    } catch (err) {
      console.error("Failed to load customer cashback", err);
      setError(true);
    }
  }, [email]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const resume = async () => {
    setBusy(true);
    try {
      const result = await resumeCustomerCashbackEmails(email, resumeReason.trim());
      addToast(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        setResuming(false);
        setResumeReason("");
        await load();
      }
    } catch (err) {
      console.error("Resuming cashback emails failed", err);
      addToast("Could not turn the emails back on.", "error");
    } finally {
      setBusy(false);
    }
  };

  const parsedAmount = Number(amount.replace(",", "."));
  const canSubmit = parsedAmount > 0 && reason.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) {
      return;
    }
    setBusy(true);
    try {
      const result = await adjustCustomerCashback(email, direction === "add" ? parsedAmount : -parsedAmount, reason.trim());
      addToast(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        setAdjusting(false);
        setAmount("");
        setReason("");
        await load();
      }
    } catch (err) {
      console.error("Cashback adjustment failed", err);
      addToast("Adjustment failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="customers__section-head">
        <h3>Cashback</h3>
        <button type="button" className="btn btn-outline btn-small" onClick={() => setAdjusting(true)} disabled={!data}>
          Adjust balance
        </button>
      </div>

      {error && <p className="customers__muted">Could not load cashback. <button type="button" className="customers__link" onClick={load}>Retry</button></p>}
      {!data && !error && <div className="skeleton h-10" />}

      {data && (
        <>
          <div className="customers__stats">
            <div><span className="customers__stat-value">{usd(data.availableUsd)}</span><span className="customers__stat-label">available</span></div>
            <div>
              <span className="customers__stat-value">{usd(data.pendingUsd)}</span>
              <span className="customers__stat-label">pending{data.nextUnlockAt ? ` · next ${day(data.nextUnlockAt)}` : ""}</span>
            </div>
            {data.reservedUsd > 0 && (
              <div><span className="customers__stat-value">{usd(data.reservedUsd)}</span><span className="customers__stat-label">held for a payment</span></div>
            )}
            <div><span className="customers__stat-value">{data.tierName} · {data.tierPercent}%</span><span className="customers__stat-label">{usd(data.qualifyingSpendUsd)} spent</span></div>
            <div><span className="customers__stat-value">{usd(data.earnedAllTimeUsd)}</span><span className="customers__stat-label">earned · {usd(data.usedAllTimeUsd)} used</span></div>
            {data.forgivenAllTimeUsd > 0 && (
              <div><span className="customers__stat-value customers__stat-value--warn">{usd(data.forgivenAllTimeUsd)}</span><span className="customers__stat-label">not recovered on refunds</span></div>
            )}
          </div>

          <div className="customers__subhead">
            <h4>Cashback emails</h4>
            {data.emails.optedOut && (
              <button type="button" className="btn btn-outline btn-small" onClick={() => setResuming(true)}>
                Turn emails back on
              </button>
            )}
          </div>
          <p className="customers__muted">
            {!data.emails.enabled
              ? "Cashback emails are switched off for everyone in the Cashback settings."
              : data.emails.optedOut
                ? `Unsubscribed from cashback emails${data.emails.optedOutAt ? ` on ${day(data.emails.optedOutAt)}` : ""} — gets neither “ready to use” nor expiry reminders.`
                : "Gets “cashback is ready” and expiry reminder emails."}
          </p>
          {data.emails.sent.length > 0 && (
            <table className="admin-table customers__table">
              <thead><tr><th>Sent</th><th>Email</th><th>About</th></tr></thead>
              <tbody>
                {data.emails.sent.map((mail, index) => (
                  <tr key={`${mail.kind}-${mail.sentAt}-${index}`}>
                    <td>{day(mail.sentAt)}</td>
                    <td>{EMAIL_LABEL[mail.kind] ?? mail.kind}</td>
                    <td className="customers__muted">
                      {[
                        mail.orderNumber ? `order ${mail.orderNumber}` : null,
                        mail.amountUsd != null ? `${usd(mail.amountUsd)} credit` : null,
                        mail.expiresAt ? `expires ${day(mail.expiresAt)}` : null,
                      ].filter(Boolean).join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h4 className="customers__subhead">History</h4>
          {data.entries.length === 0 ? (
            <p className="customers__muted">No cashback activity yet.</p>
          ) : (
            <table className="admin-table customers__table">
              <thead><tr><th>Date</th><th>What</th><th>Order</th><th>Amount</th><th>State / note</th></tr></thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{day(entry.createdAt)}</td>
                    <td>
                      {TYPE_LABEL[entry.type] ?? entry.type}
                      {entry.percent != null && <span className="customers__muted"> · {entry.percent}%</span>}
                    </td>
                    <td>
                      {entry.orderNumber
                        ? <Link className="customers__link" to={`/admin/orders?search=${encodeURIComponent(entry.orderNumber)}`}>{entry.orderNumber}</Link>
                        : "—"}
                    </td>
                    <td className="font-mono">{signed(entry)}</td>
                    <td className="customers__muted">
                      {entry.type === "adjust" ? `${entry.note ?? ""}${entry.actor ? ` — ${entry.actor}` : ""}` : entry.status ?? ""}
                      {entry.status === "pending" && entry.unlocksAt ? ` · unlocks ${day(entry.unlocksAt)}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {resuming && (
        <div className="admin-modal" role="dialog" aria-modal="true" onClick={() => !busy && setResuming(false)}>
          <div className="admin-modal__card" onClick={(event) => event.stopPropagation()}>
            <h3>Turn cashback emails back on</h3>
            <p className="text-sm text-gray-600">
              {email} unsubscribed from cashback emails. Only turn them back on if the customer asked for it — say how they asked.
            </p>
            <textarea className="w-full p-2 border rounded mt-3" rows={2} placeholder="Reason (required), e.g. customer asked in ticket #1234" value={resumeReason} onChange={(event) => setResumeReason(event.target.value)} />
            <div className="flex gap-2 justify-end mt-4">
              <button type="button" className="btn btn-outline" onClick={() => setResuming(false)} disabled={busy}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={resume} disabled={busy || !resumeReason.trim()}>
                {busy ? "Saving…" : "Turn back on"}
              </button>
            </div>
          </div>
        </div>
      )}

      {adjusting && (
        <div className="admin-modal" role="dialog" aria-modal="true" onClick={() => !busy && setAdjusting(false)}>
          <div className="admin-modal__card" onClick={(event) => event.stopPropagation()}>
            <h3>Adjust cashback balance</h3>
            <p className="text-sm text-gray-600">
              For {email}. Adding credit is immediately available; a deduction never takes the balance below zero.
              The reason is saved in the customer's cashback history together with your name.
            </p>
            <div className="flex gap-2 mt-3" style={{ alignItems: "center" }}>
              <select className="input" value={direction} onChange={(event) => setDirection(event.target.value as "add" | "deduct")} style={{ maxWidth: 140 }} aria-label="Direction">
                <option value="add">Add</option>
                <option value="deduct">Deduct</option>
              </select>
              <input className="input" inputMode="decimal" placeholder="Amount, USD" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Amount in USD" />
            </div>
            <textarea className="w-full p-2 border rounded mt-3" rows={3} placeholder="Reason (required), e.g. dispute won, goodwill for a delayed key" value={reason} onChange={(event) => setReason(event.target.value)} />
            <div className="flex gap-2 justify-end mt-4">
              <button type="button" className="btn btn-outline" onClick={() => setAdjusting(false)} disabled={busy}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
                {busy ? "Saving…" : direction === "add" ? "Add credit" : "Deduct"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default CustomerCashbackCard;
