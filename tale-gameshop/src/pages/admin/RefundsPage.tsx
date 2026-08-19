import React, { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import OrdersTable from "../../components/orders/OrdersTable";
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
  const { setHeaderActions, setPageTitle } = useAdminHeader();

  const [items, setItems] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ordersService.getOrders({ filters: REFUND_FILTER, page, pageSize, sort: "updatedAt:desc" });
      setItems(response.items);
      setTotal(response.total);
    } catch (err) {
      console.error("Failed to load refunds", err);
      setError("Unable to load refunds.");
    } finally {
      setLoading(false);
    }
  }, [ordersService, page, pageSize]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    setPageTitle("Refunds");
    setHeaderActions([
      {
        type: "button",
        id: "export-refunds",
        label: "Export CSV",
        variant: "primary",
        onClick: () => ordersService.exportCsv(REFUND_FILTER, "updatedAt:desc").catch(() => addToast("Export failed.", "error")),
      },
      { type: "button", id: "refresh-refunds", label: "Refresh", variant: "outline", onClick: fetchOrders },
    ]);
    return () => setHeaderActions([]);
  }, [addToast, fetchOrders, ordersService, setHeaderActions, setPageTitle]);

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
    setItems((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
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
        breadcrumbs={["Orders & Payments", "Refunds"]}
      />

      <Card>
        <p className="text-sm text-gray-500">
          To refund an order, open it (here or in Orders) and use <strong>Refund</strong> — Stripe orders are refunded
          automatically; for other rails, refund in the provider’s dashboard and use <strong>Mark refunded</strong>.
        </p>
      </Card>

      <OrdersTable
        items={items}
        total={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        error={error}
        onRetry={fetchOrders}
        onRowClick={handleRowClick}
        onPageChange={(nextPage, nextPageSize) => {
          setPage(nextPage);
          setPageSize(nextPageSize);
        }}
      />

      <OrderDetailsDrawer
        order={selectedOrder}
        isOpen={Boolean(selectedOrder)}
        isLoading={detailsLoading}
        error={detailsError}
        onClose={() => setSelectedOrder(null)}
        onAction={handleAction}
        onForceStatus={handleForceStatus}
      />
    </div>
  );
};

export default RefundsPage;
