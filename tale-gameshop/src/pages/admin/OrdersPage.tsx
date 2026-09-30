import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../../components/layout/PageHeader";
import OrdersFilters from "../../components/orders/OrdersFilters";
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
  const { setPageTitle } = useAdminHeader();

  // ?search= — прямая ссылка из карточки клиента и дашборда: фильтр применяется сразу.
  const [searchParams] = useSearchParams();
  const initialFilters = useMemo<OrderFilters>(
    () => ({ ...defaultFilters, search: searchParams.get("search") ?? "" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [filters, setFilters] = useState<OrderFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<OrderFilters>(initialFilters);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // По этой метке таблица пересобирает источник и забирает первое окно заново:
  // сменили фильтр, нажали Refresh, изменили заказ в дровере.
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Окно строк для таблицы: границы задаёт она сама по мере прокрутки, страница добавляет
  // только свои фильтры. API постраничный — перевод отрезка в страницы делает fetchWindow.
  const loadOrders = useCallback(
    async (skip: number, take: number) => {
      setLoading(true);
      try {
        const rows = await fetchWindow(skip, take, ORDERS_PAGE_SIZE, (page, pageSize) =>
          ordersService.getOrders({
            filters: appliedFilters,
            page,
            pageSize,
            sort: "createdAt:desc",
          })
        );
        setTotal(rows.total);
        return rows;
      } finally {
        setLoading(false);
      }
    },
    [appliedFilters, ordersService]
  );

  const fetchOrders = useCallback(() => setReloadToken((token) => token + 1), []);

  // Новый фильтр — новый запрос: таблица сама начнёт с первого окна.
  const handleApply = () => {
    setAppliedFilters(filters);
  };

  const handleReset = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
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
    // Строка живёт в таблице, а не в состоянии страницы — просим её перечитать окно.
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
  }, [setPageTitle]);

  const activeFilterCount = useMemo(() => Object.values(appliedFilters).filter(Boolean).length, [appliedFilters]);

  return (
    <div className="admin-grid">
      <PageHeader
        title="Orders"
        description="Review and manage customer orders."
        breadcrumbs={["Sales", "Orders"]}
        primaryAction={
          <>
            <button className="btn btn-primary" onClick={handleExport}>Export CSV</button>
            <button className="btn btn-outline" onClick={fetchOrders} disabled={loading}>Refresh</button>
          </>
        }
      />

      {/* Фильтры едут внутрь карточки списка: сами по себе, отдельным блоком над таблицей,
          они висели в воздухе — фильтр без строк, к которым он применяется, ничего не значит. */}
      <OrdersTable
        load={loadOrders}
        reloadToken={reloadToken}
        onRowClick={handleRowClick}
        toolbar={
          <div className="mb-4">
            <OrdersFilters
              filters={filters}
              onChange={setFilters}
              onApply={handleApply}
              onReset={handleReset}
              isLoading={loading}
            />
            {activeFilterCount > 0 && (
              <p className="mt-3 text-sm text-gray-500">
                Filters applied: {activeFilterCount} · Export CSV downloads all {total} matching order(s)
              </p>
            )}
          </div>
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

export default OrdersPage;
