import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../../components/layout/PageHeader";
import OrdersFilters from "../../components/orders/OrdersFilters";
import OrdersTable from "../../components/orders/OrdersTable";
import OrderDetailsDrawer from "../../components/orders/OrderDetailsDrawer";
import Card from "../../components/ui/Card";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IAdminOrdersService } from "../../iterfaces/i-admin-orders-service";
import type { Order, OrderAction, OrderFilters, OrderStatus } from "../../types/orders";
import { useToast } from "../../components/ui/ToastProvider";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";

const defaultFilters: OrderFilters = {
  search: "",
  status: "",
  paymentStatus: "",
  dateFrom: "",
  dateTo: "",
};

const OrdersPage: React.FC = () => {
  const ordersService = container.get<IAdminOrdersService>(IDENTIFIERS.IAdminOrdersService);
  const { addToast } = useToast();
  const { setHeaderActions, setPageTitle } = useAdminHeader();

  // ?search= — прямая ссылка из карточки клиента и дашборда: фильтр применяется сразу.
  const [searchParams] = useSearchParams();
  const initialFilters = useMemo<OrderFilters>(
    () => ({ ...defaultFilters, search: searchParams.get("search") ?? "" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [filters, setFilters] = useState<OrderFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<OrderFilters>(initialFilters);
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
      const response = await ordersService.getOrders({
        filters: appliedFilters,
        page,
        pageSize,
        sort: "createdAt:desc",
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (err) {
      console.error("Failed to load orders", err);
      setError("Unable to load orders. Check your permissions or try again.");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, ordersService, page, pageSize]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleApply = () => {
    setAppliedFilters(filters);
    setPage(1);
  };

  const handleReset = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
  };

  const handleRowClick = async (order: Order) => {
    setSelectedOrder(order);
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const details = await ordersService.getOrderById(order.id);
      setSelectedOrder(details);
    } catch (err) {
      console.error("Failed to load order details", err);
      setDetailsError("Failed to load order details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  // Сервер отвечает заказом после действия — им и обновляем дровер и строку списка, второго
  // запроса не нужно. 409 («из этого состояния нельзя») приходит как ok=false с причиной.
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

  const handlePageChange = (nextPage: number, nextPageSize: number) => {
    setPage(nextPage);
    setPageSize(nextPageSize);
  };

  // Экспорт — по применённому фильтру и по всем страницам; CSV собирает сервер.
  const handleExport = useCallback(async () => {
    try {
      await ordersService.exportCsv(appliedFilters, "createdAt:desc");
      addToast(total > 0 ? `Exporting ${total} order(s)…` : "Export started.", "success");
    } catch (err) {
      console.error("Export failed", err);
      addToast("Export failed.", "error");
    }
  }, [addToast, appliedFilters, ordersService, total]);

  useEffect(() => {
    setPageTitle("Orders");
    setHeaderActions([
      {
        type: "button",
        id: "export-orders",
        label: "Export CSV",
        variant: "primary",
        onClick: handleExport,
      },
      {
        type: "button",
        id: "refresh-orders",
        label: "Refresh",
        variant: "outline",
        onClick: fetchOrders,
      },
    ]);
    return () => setHeaderActions([]);
  }, [fetchOrders, handleExport, setHeaderActions, setPageTitle]);

  const activeFilterCount = useMemo(() => Object.values(appliedFilters).filter(Boolean).length, [appliedFilters]);

  return (
    <div className="admin-grid">
      <PageHeader
        title="Orders"
        description="Review and manage customer orders."
        breadcrumbs={["Orders", "Admin"]}
      />

      <OrdersFilters
        filters={filters}
        onChange={setFilters}
        onApply={handleApply}
        onReset={handleReset}
        isLoading={loading}
      />

      {activeFilterCount > 0 && (
        <Card>
          <p className="text-sm text-gray-500">
            Filters applied: {activeFilterCount} · Export CSV downloads all {total} matching order(s)
          </p>
        </Card>
      )}

      <OrdersTable
        items={items}
        total={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        error={error}
        onRetry={fetchOrders}
        onRowClick={handleRowClick}
        onPageChange={handlePageChange}
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

export default OrdersPage;
