import React, { useMemo, useState } from "react";
import Drawer from "../ui/Drawer";
import Card from "../ui/Card";
import ModalConfirm from "../ui/ModalConfirm";
import { useToast } from "../ui/ToastProvider";
import type { Order } from "../../types/orders";

type OrderDetailsDrawerProps = {
  order: Order | null;
  isOpen: boolean;
  isLoading: boolean;
  error?: string | null;
  onClose: () => void;
  onRequestStatusChange: () => void;
};

const maskKey = (value?: string) => {
  if (!value) {
    return "";
  }
  if (value.length <= 6) {
    return "••••••";
  }
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
};

const OrderDetailsDrawer: React.FC<OrderDetailsDrawerProps> = ({
  order,
  isOpen,
  isLoading,
  error,
  onClose,
  onRequestStatusChange,
}) => {
  const { addToast } = useToast();
  const [revealTarget, setRevealTarget] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});

  const handleReveal = (key: string) => {
    setRevealTarget(key);
  };

  const confirmReveal = () => {
    if (revealTarget) {
      setRevealedKeys((prev) => ({ ...prev, [revealTarget]: true }));
    }
    setRevealTarget(null);
  };

  const formattedTotal = useMemo(() => {
    if (!order) {
      return "";
    }
    return `${order.totalAmount.toFixed(2)} ${order.currency}`;
  }, [order]);

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addToast(`${label} copied.`, "success");
    } catch (error) {
      console.error("Copy failed", error);
      addToast("Copy failed.", "error");
    }
  };

  return (
    <>
      <Drawer isOpen={isOpen} title={order ? `Order #${order.number}` : "Order details"} onClose={onClose}>
        {isLoading ? (
          <div className="space-y-3">
            <div className="skeleton h-10" />
            <div className="skeleton h-20" />
            <div className="skeleton h-20" />
          </div>
        ) : error ? (
          <div className="text-sm text-red-500">{error}</div>
        ) : order ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700">{order.status}</span>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-outline" onClick={onRequestStatusChange}>
                  Change status
                </button>
              </div>
            </div>

            <Card>
              <h3>Summary</h3>
              <div className="flex items-center justify-between gap-2">
                <p className="admin-table__cell-truncate" title={order.id}>
                  <strong>Order ID:</strong> {order.id}
                </p>
                <button className="btn btn-outline" onClick={() => handleCopy(order.id, "Order ID")}>
                  Copy
                </button>
              </div>
              <p>
                <strong>Created:</strong> {new Date(order.createdAt).toLocaleString()}
              </p>
              <p>
                <strong>Updated:</strong> {new Date(order.updatedAt).toLocaleString()}
              </p>
              <p>
                <strong>User:</strong> {order.userEmail ?? order.userId}
              </p>
              <p>
                <strong>Total:</strong> {formattedTotal}
              </p>
            </Card>

            <Card>
              <h3>Items</h3>
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div key={`${item.gameId}-${item.title}`} className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-xs text-gray-500">
                        Qty {item.qty} • {item.price.toFixed(2)}
                      </p>
                      {item.keyDeliveryStatus && (
                        <p className="text-xs text-gray-500">Key status: {item.keyDeliveryStatus}</p>
                      )}
                    </div>
                    {item.keyValue && (
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Key</p>
                        <p className="font-mono text-sm">
                          {revealedKeys[item.keyValue] ? item.keyValue : maskKey(item.keyValue)}
                        </p>
                        {!revealedKeys[item.keyValue] && (
                          <button
                            type="button"
                            className="btn btn-outline mt-2"
                            onClick={() => handleReveal(item.keyValue ?? "")}
                          >
                            Reveal
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3>Payment</h3>
              <p>
                <strong>Status:</strong> {order.paymentStatus ?? "—"}
              </p>
              <p>
                <strong>Provider:</strong> {order.payment?.provider ?? "—"}
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="admin-table__cell-truncate" title={order.payment?.transactionId ?? "—"}>
                  <strong>Transaction ID:</strong> {order.payment?.transactionId ?? "—"}
                </p>
                {order.payment?.transactionId && (
                  <button
                    className="btn btn-outline"
                    onClick={() => handleCopy(order.payment?.transactionId ?? "", "Transaction ID")}
                  >
                    Copy
                  </button>
                )}
              </div>
            </Card>

            <Card>
              <h3>Status updates</h3>
              <p className="text-sm text-gray-500">Latest status: {order.status}</p>
            </Card>

            <Card>
              <h3>Notes</h3>
              <p className="text-sm text-gray-600">{order.notes ?? "No internal notes yet."}</p>
            </Card>
          </div>
        ) : null}
      </Drawer>

      <ModalConfirm
        isOpen={Boolean(revealTarget)}
        title="Reveal product key?"
        description="Make sure no one else is viewing the screen."
        confirmLabel="Reveal"
        onConfirm={confirmReveal}
        onCancel={() => setRevealTarget(null)}
      />
    </>
  );
};

export default OrderDetailsDrawer;
