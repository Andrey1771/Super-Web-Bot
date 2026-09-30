import React, { useMemo, useState } from "react";
import Drawer from "../ui/Drawer";
import Card from "../ui/Card";
import { useToast } from "../ui/ToastProvider";
import type { Order, OrderAction, OrderActionResult, OrderItem, OrderStatus } from "../../types/orders";
import { formatOrderMoney } from "../../utils/format-money";
import { taxLabel } from "../../utils/tax-label";
import "./order-details-drawer.css";

/**
 * Карточка заказа в админке. Главное здесь — действия по состоянию, а не «поменять статус»:
 * специалист нажимает то, что реально хочет сделать (переотправить ключи, выдать, вернуть
 * деньги), а статус меняется как следствие. Свободная смена статуса осталась одна, «Force
 * status», с обязательной причиной — как аварийный инструмент.
 */

type OrderDetailsDrawerProps = {
  order: Order | null;
  isOpen: boolean;
  isLoading: boolean;
  error?: string | null;
  onClose: () => void;
  onAction: (action: OrderAction, reason?: string) => Promise<OrderActionResult>;
  onForceStatus: (status: OrderStatus, reason: string) => Promise<OrderActionResult>;
  /** Возврат одной позиции. Нет — кнопок возврата у позиций не показываем. */
  onRefundItem?: (itemId: string, quantity: number, reason: string) => Promise<OrderActionResult>;
};

/**
 * Сколько уйдёт на карту и сколько вернётся кэшбэком при возврате части позиции — то же правило, что на сервере
 * (OrderRefunds.Plan): на карту — накопленная доля списанного картой, вниз до цента, минус уже возвращённое; последняя
 * позиция забирает остаток. Показывается как «≈»: последнее слово за сервером.
 */
export const previewItemRefund = (order: Order, item: OrderItem, quantity: number) => {
  const itemsValue = order.items.reduce((sum, line) => sum + Math.max(0, line.lineTotal), 0);
  if (itemsValue <= 0 || item.qty <= 0) {
    return null;
  }
  const lineValue = (item.lineTotal * quantity) / item.qty;
  const allRefunded = order.items.every((line) =>
    line === item ? line.refundedQty + quantity >= line.qty : line.refundedQty >= line.qty || line.qty <= 0
  );
  const refundedValue = order.items.reduce((sum, line) => sum + (line.qty > 0 ? (line.lineTotal * line.refundedQty) / line.qty : 0), 0);
  const share = allRefunded ? 1 : Math.min(1, (refundedValue + lineValue) / itemsValue);
  const card = order.totalAmount;
  const already = order.refundedAmount ?? 0;
  const target = allRefunded ? card : Math.floor(card * share * 100 + 1e-9) / 100;
  const toCard = Math.max(0, Math.min(target - already, card - already));
  return { lineValue, toCard, toCashback: Math.max(0, lineValue - toCard), allRefunded };
};

const DISPUTE_STATUS: Record<string, string> = {
  needs_response: "Waiting for your evidence",
  under_review: "Evidence sent — bank is reviewing",
  warning_needs_response: "Bank inquiry — waiting for your answer",
  warning_under_review: "Bank inquiry — under review",
  warning_closed: "Bank inquiry closed, nothing withdrawn",
  won: "Won — money returned to the shop",
  lost: "Lost — money stays with the customer",
};

/**
 * Спор по оплате. Главное здесь — срок: пропущенный срок ответа банку означает проигрыш автоматически, поэтому
 * оставшееся время выделено, а при сроке меньше трёх суток — красным. Сами доказательства отправляются в Stripe.
 */
const DisputeCard: React.FC<{ dispute: NonNullable<Order["dispute"]> }> = ({ dispute }) => {
  const closed = Boolean(dispute.outcome);
  const due = dispute.evidenceDueBy ? new Date(dispute.evidenceDueBy) : null;
  const needsAnswer = !closed && !dispute.hasEvidence && dispute.status.endsWith("needs_response");
  const hoursLeft = due ? (due.getTime() - Date.now()) / 3_600_000 : null;
  const urgent = needsAnswer && hoursLeft !== null && hoursLeft < 72;
  const tone = dispute.outcome === "lost" ? "order-drawer__status--refunded"
    : closed ? "order-drawer__status--delivered"
      : "order-drawer__status--warn";
  const left = hoursLeft === null ? ""
    : hoursLeft <= 0 ? "deadline passed"
      : hoursLeft < 48 ? `${Math.floor(hoursLeft)} h left`
        : `${Math.floor(hoursLeft / 24)} days left`;

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3>Payment dispute</h3>
        <span className={`order-drawer__status ${tone}`}>{DISPUTE_STATUS[dispute.status] ?? dispute.status.replace(/_/g, " ")}</span>
      </div>
      <p>
        <strong>Amount:</strong> {formatOrderMoney(dispute.amount, dispute.currency)}
        {dispute.reason ? ` · reason: ${dispute.reason.replace(/_/g, " ")}` : ""}
      </p>
      <p><strong>Opened:</strong> {new Date(dispute.openedAt).toLocaleString()}</p>
      {needsAnswer && due && (
        <p className={urgent ? "order-drawer__deadline order-drawer__deadline--urgent" : "order-drawer__deadline"}>
          <strong>Submit evidence by:</strong> {due.toLocaleString()} ({left})
        </p>
      )}
      {!closed && dispute.hasEvidence && <p><strong>Evidence:</strong> submitted, waiting for the bank.</p>}
      {dispute.closedAt && <p><strong>Closed:</strong> {new Date(dispute.closedAt).toLocaleString()}</p>}
      <p className="text-sm text-gray-500">
        {closed
          ? dispute.outcome === "lost"
            ? "Counted as a refund: cashback and tax were adjusted. Keys are not revoked automatically — review the customer."
            : "The order counts as paid again and the customer's cashback was given back."
          : "Evidence is submitted in the Stripe Dashboard (dispute " + dispute.id + "). Useful: the delivery consent, key delivery time and the customer's account activity."}
      </p>
    </Card>
  );
};

/** Состояние начисленного за заказ кэшбэка — теми же словами, что в карточке покупателя. */
const EARNED_STATUS: Record<string, string> = {
  pending: "pending",
  available: "on the customer's balance",
  spent: "already spent",
  expired: "expired",
  reverted: "taken back with a refund or dispute",
};

const FORCE_STATUSES: OrderStatus[] = [
  "PENDING", "PAID", "PROCESSING", "AWAITING_KEYS", "DELIVERED", "CANCELLED", "REFUNDED", "FAILED",
];

type Pending =
  | { kind: "action"; action: OrderAction; title: string; hint: string; needsReason: boolean; danger?: boolean }
  | { kind: "force" }
  | { kind: "item"; item: OrderItem };

const eventLabel = (type: string): string => {
  switch (type) {
    case "keys_resent": return "Keys re-sent";
    case "keys_viewed": return "Keys viewed by customer";
    case "keys_delivered_manually": return "Keys delivered by hand";
    case "fulfillment": return "Fulfillment";
    case "refund": return "Refund";
    case "refund_failed": return "Refund failed";
    case "cancelled": return "Cancelled";
    case "status_forced": return "Status forced";
    case "payment": return "Payment";
    default: return type.replace(/_/g, " ");
  }
};

const OrderDetailsDrawer: React.FC<OrderDetailsDrawerProps> = ({
  order,
  isOpen,
  isLoading,
  error,
  onClose,
  onAction,
  onForceStatus,
  onRefundItem,
}) => {
  const { addToast } = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [forceStatus, setForceStatus] = useState<OrderStatus>("PAID");
  const [refundQty, setRefundQty] = useState(1);
  const [busy, setBusy] = useState(false);

  const formattedTotal = useMemo(() => (order ? formatOrderMoney(order.totalAmount, order.currency) : ""), [order]);

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addToast(`${label} copied.`, "success");
    } catch (err) {
      console.error("Copy failed", err);
      addToast("Copy failed.", "error");
    }
  };

  // Какие действия имеют смысл из текущего состояния. Правила дублируют серверные
  // предусловия только чтобы не показывать кнопку, которая заведомо ответит 409; последнее
  // слово всё равно за сервером.
  const paid = Boolean(order && (order.paymentStatus === "PAID" || order.status === "PAID" || order.status === "PROCESSING" || order.status === "AWAITING_KEYS" || order.status === "DELIVERED"));
  const refunded = Boolean(order && (order.status === "REFUNDED" || order.paymentStatus === "REFUNDED"));
  const cancelled = order?.status === "CANCELLED";
  const delivered = Boolean(order && order.items.length > 0 && order.items.every((i) => i.keysDelivered >= i.keysNeeded));
  const anyDelivered = Boolean(order && order.items.some((i) => i.keysDelivered > 0));
  const hasEmail = Boolean(order?.userEmail);
  const isStripe = (order?.payment?.provider ?? "").toLowerCase() === "stripe" && Boolean(order?.payment?.transactionId);

  const canResend = anyDelivered && hasEmail && !refunded;
  const canDeliver = paid && !delivered && !refunded && !cancelled && !order?.requiresDeliveryVerification;
  const canRefund = paid && !refunded && isStripe;
  const canMarkRefunded = paid && !refunded && !isStripe;
  const canCancel = !paid && !cancelled && !refunded;
  // Частично возвращённый заказ всё ещё оплачен: по оставшимся позициям возврат доступен.
  const canRefundItems = Boolean(onRefundItem) && isStripe && !refunded && !order?.dispute?.status?.includes("needs_response")
    && (paid || order?.paymentStatus === "PARTIALLY_REFUNDED");

  const open = (p: Pending) => {
    setReason("");
    setPending(p);
  };

  const confirm = async () => {
    if (!pending) {
      return;
    }
    setBusy(true);
    try {
      const result =
        pending.kind === "force"
          ? await onForceStatus(forceStatus, reason.trim())
          : pending.kind === "item"
            ? await onRefundItem!(pending.item.itemId, refundQty, reason.trim())
            : await onAction(pending.action, reason.trim() || undefined);
      addToast(result.message || (result.ok ? "Done." : "Refused."), result.ok ? "success" : "error");
      if (result.ok) {
        setPending(null);
      }
    } catch (err) {
      console.error("Order action failed", err);
      addToast("Action failed — check the console and server logs.", "error");
    } finally {
      setBusy(false);
    }
  };

  const reasonMissing = pending
    ? pending.kind === "action" ? pending.needsReason && reason.trim().length === 0 : reason.trim().length === 0
    : false;
  const itemPreview = order && pending?.kind === "item" ? previewItemRefund(order, pending.item, refundQty) : null;

  return (
    <>
      <Drawer isOpen={isOpen} title={order ? `Order ${order.number}` : "Order details"} onClose={onClose}>
        {isLoading ? (
          <div className="stack-y-3">
            <div className="skeleton h-10" />
            <div className="skeleton h-20" />
            <div className="skeleton h-20" />
          </div>
        ) : error ? (
          <div className="text-sm text-red-500">{error}</div>
        ) : order ? (
          <div className="stack-y-4">
            <div className="order-drawer__head">
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <span className={`order-drawer__status order-drawer__status--${order.status.toLowerCase()}`}>{order.status}</span>
                {order.paymentStatus && order.paymentStatus !== "PAID" && (
                  <span className="order-drawer__status order-drawer__status--muted">{order.paymentStatus}</span>
                )}
                {order.requiresDeliveryVerification && (
                  <span className="order-drawer__status order-drawer__status--warn" title="Guest has not confirmed the e-mail; keys are held">
                    E-MAIL NOT CONFIRMED
                  </span>
                )}
              </div>
            </div>

            <Card>
              <h3>Actions</h3>
              <div className="order-drawer__actions">
                <button
                  className="btn btn-primary"
                  disabled={!canDeliver}
                  title={canDeliver ? "Take keys from the pool and send them" : "Only for paid orders that still wait for keys"}
                  onClick={() => open({ kind: "action", action: "deliver-keys", title: "Deliver keys now?", hint: "Keys are taken from the pool for each game on this order and e-mailed to the customer. Nothing happens if the pool is empty.", needsReason: false })}
                >
                  Deliver keys
                </button>
                <button
                  className="btn btn-outline"
                  disabled={!canResend}
                  title={canResend ? "E-mail the delivered keys again" : "Nothing delivered yet, or no e-mail on the order"}
                  onClick={() => open({ kind: "action", action: "resend-keys", title: "Re-send keys?", hint: `The delivered keys will be e-mailed again to ${order.userEmail ?? "the customer"}.`, needsReason: false })}
                >
                  Resend keys
                </button>
                {isStripe ? (
                  <button
                    className="btn btn-outline order-drawer__danger"
                    disabled={!canRefund}
                    title={canRefund ? "Full refund through Stripe" : "Only paid, not yet refunded Stripe orders"}
                    onClick={() => open({ kind: "action", action: "refund", title: "Refund this order?", hint: "A full refund is sent to Stripe. The order becomes REFUNDED and the customer gets an e-mail. This cannot be undone.", needsReason: true, danger: true })}
                  >
                    Refund
                  </button>
                ) : (
                  <button
                    className="btn btn-outline order-drawer__danger"
                    disabled={!canMarkRefunded}
                    title={canMarkRefunded ? "Record a refund made outside the system" : "Only paid, not yet refunded orders"}
                    onClick={() => open({ kind: "action", action: "mark-refunded", title: "Mark as refunded?", hint: `This order was paid via ${order.payment?.provider ?? "another rail"} — refund it there first, then record it here. No money moves.`, needsReason: true, danger: true })}
                  >
                    Mark refunded
                  </button>
                )}
                <button
                  className="btn btn-outline"
                  disabled={!canCancel}
                  title={canCancel ? "Cancel this unpaid order" : "Paid orders are refunded, not cancelled"}
                  onClick={() => open({ kind: "action", action: "cancel", title: "Cancel this order?", hint: "For unpaid orders only.", needsReason: false })}
                >
                  Cancel
                </button>
                <button className="btn btn-outline order-drawer__force" onClick={() => { setForceStatus(order.status); open({ kind: "force" }); }}>
                  Force status…
                </button>
              </div>
            </Card>

            {order.dispute && <DisputeCard dispute={order.dispute} />}

            <Card>
              <h3>Summary</h3>
              <div className="flex items-center justify-between gap-2">
                <p className="admin-table__cell-truncate" title={order.id}>
                  <strong>Order ID:</strong> {order.id}
                </p>
                <button className="btn btn-outline" onClick={() => handleCopy(order.id, "Order ID")}>Copy</button>
              </div>
              <p><strong>Created:</strong> {new Date(order.createdAt).toLocaleString()}</p>
              {order.paidAt && <p><strong>Paid:</strong> {new Date(order.paidAt).toLocaleString()}</p>}
              <p><strong>Updated:</strong> {new Date(order.updatedAt).toLocaleString()}</p>
              <p><strong>Customer:</strong> {order.userEmail ?? order.userId}</p>
              <p><strong>Total:</strong> {formattedTotal}{order.promoCode ? ` · promo ${order.promoCode}` : ""}</p>
              {/* Total — то, что списано картой; часть, оплаченная кэшбэком, в нём не видна. */}
              {Boolean(order.cashbackApplied && order.cashbackApplied > 0) && (
                <p>
                  <strong>Paid with cashback:</strong> {formatOrderMoney(order.cashbackApplied ?? 0, order.currency)}
                  {order.currency !== "USD" && order.cashbackUsd ? ` (${formatOrderMoney(order.cashbackUsd, "USD")} from the balance)` : ""}
                </p>
              )}
              {/* Начисленный за заказ кэшбэк: при разборе возврата видно, что покупатель получил и что у него заберут. */}
              {order.cashbackEarned && (
                <p>
                  <strong>Cashback earned:</strong>{" "}
                  +{formatOrderMoney(order.cashbackEarned.amount, order.cashbackEarned.currency)}
                  {order.cashbackEarned.percent != null ? ` (${order.cashbackEarned.percent}%)` : ""}
                  {" · "}
                  {EARNED_STATUS[order.cashbackEarned.status] ?? order.cashbackEarned.status}
                  {order.cashbackEarned.status === "pending" && order.cashbackEarned.unlocksAt
                    ? ` until ${new Date(order.cashbackEarned.unlocksAt).toLocaleDateString()}`
                    : ""}
                  {order.cashbackEarned.reversedUsd > 0 && order.cashbackEarned.status !== "reverted"
                    ? ` · ${formatOrderMoney(order.cashbackEarned.reversedUsd, "USD")} taken back`
                    : ""}
                </p>
              )}
              {/* Налог внутри итога. pending — транзакция в Stripe Tax ещё не записана, ежечасная сверка повторит. */}
              {order.tax && (
                <p>
                  <strong>Tax:</strong>{" "}
                  {order.tax.amount > 0
                    ? `incl. ${taxLabel(order.tax.taxType, order.tax.ratePercent)} ${formatOrderMoney(order.tax.amount, order.currency)}`
                    : "none"}
                  {order.tax.country ? ` · ${order.tax.country}${order.tax.state ? `-${order.tax.state}` : ""}` : ""}
                  {order.tax.locationSource ? ` (by ${order.tax.locationSource.replace(/_/g, " ")})` : ""}
                  {order.tax.taxabilityReason && order.tax.taxabilityReason !== "standard_rated" ? ` · ${order.tax.taxabilityReason.replace(/_/g, " ")}` : ""}
                  {" · "}
                  {order.tax.status === "recorded" ? "recorded in Stripe Tax" : "not recorded yet — retried hourly"}
                  {order.tax.reversed > 0 ? ` · reversed ${formatOrderMoney(order.tax.reversed, order.currency)}` : ""}
                  {order.tax.status !== "recorded" && order.tax.lastError ? <><br /><small>{order.tax.lastError}</small></> : null}
                </p>
              )}
            </Card>

            <Card>
              <h3>Items</h3>
              <div className="stack-y-3">
                {order.items.map((item, index) => (
                  <div key={`${item.gameId}-${index}`} className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      {item.region ? (
                        /* Из какой партии ждать ключ: у заказа с региональным вариантом
                           «нет ключей» лечится пополнением конкретной партии, а не любой. */
                        <p className="text-xs opacity-70">Key region: {item.region}</p>
                      ) : null}
                      <p className="text-xs text-gray-500">
                        Qty {item.qty} • {formatOrderMoney(item.price, order.currency)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        Keys {item.keysDelivered}/{item.keysNeeded}
                      </p>
                      {item.keyMasks.map((mask, i) => (
                        <p key={i} className="font-mono text-sm">{mask}</p>
                      ))}
                      {item.keysDelivered < item.keysNeeded && (
                        <p className="text-xs order-drawer__waiting">
                          {item.keysNeeded - item.keysDelivered} waiting for stock
                        </p>
                      )}
                      {item.refundedQty > 0 && (
                        <p className="text-xs order-drawer__refunded">
                          {item.refundedQty >= item.qty ? "Refunded" : `${item.refundedQty} of ${item.qty} refunded`}
                        </p>
                      )}
                      {canRefundItems && item.itemId && item.refundedQty < item.qty && (
                        <button
                          className="btn btn-outline order-drawer__danger order-drawer__item-refund"
                          title="Refund this item: its share goes back to the card, the part paid with cashback back to the balance"
                          onClick={() => { setRefundQty(1); open({ kind: "item", item }); }}
                        >
                          Refund item
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Открытых ключей в админке нет: они лежат у клиента в кабинете и уходят письмом.
                  Специалисту нужно «дошёл ли ключ», а не сам ключ — для этого есть Resend keys. */}
            </Card>

            <Card>
              <h3>Payment</h3>
              <p><strong>Status:</strong> {order.paymentStatus ?? "—"}</p>
              <p><strong>Provider:</strong> {order.payment?.provider ?? "—"}</p>
              <div className="flex items-center justify-between gap-2">
                <p className="admin-table__cell-truncate" title={order.payment?.transactionId ?? "—"}>
                  <strong>Transaction ID:</strong> {order.payment?.transactionId ?? "—"}
                </p>
                {order.payment?.transactionId && (
                  <button className="btn btn-outline" onClick={() => handleCopy(order.payment?.transactionId ?? "", "Transaction ID")}>
                    Copy
                  </button>
                )}
              </div>
            </Card>

            <Card>
              <h3>History</h3>
              {order.events.length === 0 ? (
                <p className="text-sm text-gray-500">No events recorded for this order.</p>
              ) : (
                <ul className="order-drawer__history">
                  {[...order.events].reverse().map((event, index) => (
                    <li key={`${event.createdAt}-${index}`} className="order-drawer__event">
                      <div className="order-drawer__event-head">
                        <span className="order-drawer__event-type">{eventLabel(event.type)}</span>
                        <span className="order-drawer__event-when" title={new Date(event.createdAt).toLocaleString()}>
                          {new Date(event.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </div>
                      {event.message && <p className="order-drawer__event-msg">{event.message}</p>}
                      <p className="order-drawer__event-actor">{event.actor ? `by ${event.actor}` : "system"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {order.notes && (
              <Card>
                <h3>Notes</h3>
                <p className="text-sm text-gray-600">{order.notes}</p>
              </Card>
            )}
          </div>
        ) : null}
      </Drawer>

      {pending && (
        <div className="admin-modal" role="dialog" aria-modal="true" onClick={() => !busy && setPending(null)}>
          <div className="admin-modal__card" onClick={(e) => e.stopPropagation()}>
            {pending.kind === "force" ? (
              <>
                <h3>Force status</h3>
                <p className="text-sm text-gray-600">
                  Sets the status directly, without delivering keys or moving money. Use only when the record has drifted from
                  reality. The reason goes into the order history with your name.
                </p>
                <select className="w-full p-2 border rounded-sm mt-3" value={forceStatus} onChange={(e) => setForceStatus(e.target.value as OrderStatus)}>
                  {FORCE_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </>
            ) : pending.kind === "item" ? (
              <>
                <h3>Refund {pending.item.title}?</h3>
                {pending.item.qty - pending.item.refundedQty > 1 && (
                  <label className="order-drawer__qty">
                    Quantity
                    <select value={refundQty} onChange={(e) => setRefundQty(Number(e.target.value))}>
                      {Array.from({ length: pending.item.qty - pending.item.refundedQty }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                )}
                {itemPreview && order && (
                  <ul className="order-drawer__refund-preview">
                    <li><span>Item value</span><b>{formatOrderMoney(itemPreview.lineValue, order.currency)}</b></li>
                    <li><span>Back to the card</span><b>≈ {formatOrderMoney(itemPreview.toCard, order.currency)}</b></li>
                    {Boolean(order.cashbackApplied) && itemPreview.toCashback > 0 && (
                      <li><span>Back to the cashback balance</span><b>≈ {formatOrderMoney(itemPreview.toCashback, order.currency)}</b></li>
                    )}
                  </ul>
                )}
                <p className="text-sm text-gray-600">
                  {itemPreview?.allRefunded
                    ? "This is the last item: the order becomes REFUNDED and the customer gets an e-mail."
                    : "The order stays open with the other items. Cashback earned for the order is reduced in the same share."}
                  {" "}Delivered keys are not revoked. This cannot be undone.
                </p>
              </>
            ) : (
              <>
                <h3>{pending.title}</h3>
                <p className="text-sm text-gray-600">{pending.hint}</p>
              </>
            )}
            <textarea
              className="w-full p-2 border rounded-sm mt-3"
              rows={3}
              placeholder={pending.kind !== "action" || pending.needsReason ? "Reason (required)" : "Note (optional)"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn btn-outline" onClick={() => setPending(null)} disabled={busy}>Cancel</button>
              <button
                className={`btn ${(pending.kind === "action" && pending.danger) || pending.kind === "item" ? "btn-primary order-drawer__danger-fill" : "btn-primary"}`}
                onClick={confirm}
                disabled={busy || reasonMissing}
              >
                {busy ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OrderDetailsDrawer;
