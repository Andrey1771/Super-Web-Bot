import React, { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import OrdersTable, { ORDERS_PAGE_SIZE } from "../../components/orders/OrdersTable";
import { fetchWindow } from "../../utils/page-window";
import OrderDetailsDrawer from "../../components/orders/OrderDetailsDrawer";
import Card from "../../components/ui/Card";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IAdminOrdersService } from "../../iterfaces/i-admin-orders-service";
import type { Order, OrderAction, OrderFilters, OrderStatus } from "../../types/orders";
import { useToast } from "../../components/ui/ToastProvider";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";

/**
 * Возвраты и споры. Это не отдельная сущность, а срез заказов: всё, где деньги ушли обратно
 * (REFUNDED, PARTIALLY_REFUNDED), ждут возврата (REFUND_PENDING) или оспариваются (DISPUTED).
 * Сам возврат делается из карточки заказа — здесь список, чтобы видеть их вместе, и та же
 * карточка, чтобы не искать заказ второй раз.
 */

const REFUND_FILTER: OrderFilters = {
  search: "",
  status: "",
  paymentStatus: "REFUNDS" as OrderFilters["paymentStatus"],
  dateFrom: "",
  dateTo: "",
};

const RefundsPage: React.FC = () => {
  const ordersService = container.get<IAdminOrdersService>(IDENTIFIERS.IAdminOrdersService);
  const { addToast } = useToast();
  const { setPageTitle } = useAdminHeader();

  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Окно строк для таблицы; границы приходят от неё по мере прокрутки.
  const loadOrders = useCallback(
    async (skip: number, take: number) => {
      setLoading(true);
      try {
        return await fetchWindow(skip, take, ORDERS_PAGE_SIZE, (page, pageSize) =>
          ordersService.getOrders({ filters: REFUND_FILTER, page, pageSize, sort: "updatedAt:desc" })
        );
      } finally {
        setLoading(false);
      }
    },
    [ordersService]
  );

  const fetchOrders = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    setPageTitle("Refunds");
  }, [setPageTitle]);

  const handleRowClick = async (order: Order) => {
    setSelectedOrder(order);
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      setSelectedOrder(await ordersService.getOrderById(order.id));
    } catch (err) {
      console.error("Failed to load order details", err);
      setDetailsError("Failed to load order details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const applyResult = useCallback((updated: Order) => {
    if (!updated.id) {
      return;
    }
    setSelectedOrder(updated);
    setReloadToken((token) => token + 1);
  }, []);

  const handleAction = useCallback(
    async (action: OrderAction, reason?: string) => {
      if (!selectedOrder) {
        throw new Error("No order selected");
      }
      const result = await ordersService.runAction(selectedOrder.id, action, reason);
      applyResult(result.order);
      return result;
    },
    [applyResult, ordersService, selectedOrder]
  );

  const handleRefundItem = useCallback(
    async (itemId: string, quantity: number, reason: string) => {
      if (!selectedOrder) {
        throw new Error("No order selected");
      }
      const result = await ordersService.refundItem(selectedOrder.id, itemId, quantity, reason);
      applyResult(result.order);
      return result;
    },
    [applyResult, ordersService, selectedOrder]
  );

  const handleForceStatus = useCallback(
    async (status: OrderStatus, reason: string) => {
      if (!selectedOrder) {
        throw new Error("No order selected");
      }
      const result = await ordersService.forceStatus(selectedOrder.id, status, reason);
      applyResult(result.order);
      return result;
    },
    [applyResult, ordersService, selectedOrder]
  );

  return (
    <div className="admin-grid">
      <PageHeader
        title="Refunds"
        description="Orders that were refunded, partially refunded, are waiting for a refund, or are disputed."
        breadcrumbs={["Sales", "Refunds"]}
        primaryAction={
          <>
            <button
              className="btn btn-primary"
              onClick={() => ordersService.exportCsv(REFUND_FILTER, "updatedAt:desc").catch(() => addToast("Export failed.", "error"))}
            >
              Export CSV
            </button>
            <button className="btn btn-outline" onClick={fetchOrders} disabled={loading}>Refresh</button>
          </>
        }
      />

      <OrdersTable
        load={loadOrders}
        reloadToken={reloadToken}
        onRowClick={handleRowClick}
        toolbar={
          <p className="mb-4 text-sm text-gray-500">
            To refund an order, open it (here or in Orders) and use <strong>Refund</strong> — Stripe orders are refunded
            automatically; for other rails, refund in the provider’s dashboard and use <strong>Mark refunded</strong>.
          </p>
        }
      />

      <OrderDetailsDrawer
        order={selectedOrder}
        isOpen={Boolean(selectedOrder)}
        isLoading={detailsLoading}
        error={detailsError}
        onClose={() => setSelectedOrder(null)}
        onAction={handleAction}
        onForceStatus={handleForceStatus}
        onRefundItem={handleRefundItem}
      />
    </div>
  );
};

export default RefundsPage;
