import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import OrdersFilters from "../../components/orders/OrdersFilters";
import OrdersTable from "../../components/orders/OrdersTable";
import OrderDetailsDrawer from "../../components/orders/OrderDetailsDrawer";
import Card from "../../components/ui/Card";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IAdminOrdersService } from "../../iterfaces/i-admin-orders-service";
import type { Order, OrderFilters, OrderStatus } from "../../types/orders";
import { useToast } from "../../components/ui/ToastProvider";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";

const defaultFilters: OrderFilters = {
  search: "",
  status: "",
  paymentStatus: "",
  dateFrom: "",
  dateTo: "",
};

const statusOptions: OrderStatus[] = [
  "PENDING",
  "PAID",
  "PROCESSING",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
  "FAILED",
];

const OrdersPage: React.FC = () => {
  const ordersService = container.get<IAdminOrdersService>(IDENTIFIERS.IAdminOrdersService);
  const { addToast } = useToast();
  const { setHeaderActions, setPageTitle } = useAdminHeader();

  const [filters, setFilters] = useState<OrderFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<OrderFilters>(defaultFilters);
  const [items, setItems] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState<OrderStatus>("PENDING");
  const [statusNote, setStatusNote] = useState("");

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
    } catch (error) {
      console.error("Failed to load orders", error);
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
    } catch (error) {
      console.error("Failed to load order details", error);
      setDetailsError("Failed to load order details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleStatusChangeOpen = () => {
    if (!selectedOrder) {
      return;
    }
    setStatusDraft(selectedOrder.status);
    setStatusNote(selectedOrder.notes ?? "");
    setStatusModalOpen(true);
  };

  const handleStatusConfirm = async () => {
    if (!selectedOrder) {
      return;
    }
    try {
      const updated = await ordersService.updateStatus(selectedOrder.id, statusDraft, statusNote);
      setSelectedOrder(updated);
      await fetchOrders();
      addToast("Order status updated.", "success");
    } catch (error) {
      console.error("Failed to update status", error);
      addToast("Failed to update order status.", "error");
    } finally {
      setStatusModalOpen(false);
    }
  };

  const handlePageChange = (nextPage: number, nextPageSize: number) => {
    setPage(nextPage);
    setPageSize(nextPageSize);
  };

  const handleExport = useCallback(() => {
    ordersService.exportCsv(items);
    addToast("Export started.", "success");
  }, [addToast, items, ordersService]);

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

  const activeFilterCount = useMemo(() => {
    return Object.values(appliedFilters).filter(Boolean).length;
  }, [appliedFilters]);

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
          <p className="text-sm text-gray-500">Filters applied: {activeFilterCount}</p>
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
        onRequestStatusChange={handleStatusChangeOpen}
      />

      {statusModalOpen && (
        <div className="admin-modal" onClick={() => setStatusModalOpen(false)}>
          <div className="admin-modal__card" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-2">Change status</h2>
            <label className="text-sm font-semibold">Status</label>
            <select
              className="w-full p-2 border rounded mb-3"
              value={statusDraft}
              onChange={(event) => setStatusDraft(event.target.value as OrderStatus)}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <label className="text-sm font-semibold">Internal note</label>
            <textarea
              className="w-full p-2 border rounded min-h-[100px]"
              value={statusNote}
              onChange={(event) => setStatusNote(event.target.value)}
              placeholder="Optional note for the order."
            />
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn btn-outline" onClick={() => setStatusModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleStatusConfirm}>
                Save status
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default OrdersPage;
