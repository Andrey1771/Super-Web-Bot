import React from "react";
import Card from "../ui/Card";
import type { OrderFilters, OrderStatus, PaymentStatus } from "../../types/orders";

type OrdersFiltersProps = {
  filters: OrderFilters;
  onChange: (next: OrderFilters) => void;
  onApply: () => void;
  onReset: () => void;
  isLoading?: boolean;
};

const statusOptions: (OrderStatus | "")[] = [
  "",
  "PENDING",
  "PAID",
  "PROCESSING",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
  "FAILED",
];

const paymentOptions: (PaymentStatus | "")[] = ["", "UNPAID", "PAID", "REFUNDED", "FAILED"];

const OrdersFilters: React.FC<OrdersFiltersProps> = ({ filters, onChange, onApply, onReset, isLoading }) => {
  return (
    <Card>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-sm font-semibold">Search</label>
          <input
            type="text"
            className="w-full p-2 border rounded"
            placeholder="Order #, email, user id, transaction id"
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
          />
        </div>
        <div>
          <label className="text-sm font-semibold">Status</label>
          <select
            className="w-full p-2 border rounded"
            value={filters.status}
            onChange={(event) => onChange({ ...filters, status: event.target.value as OrderFilters["status"] })}
          >
            {statusOptions.map((status) => (
              <option key={status || "all"} value={status}>
                {status ? status : "All"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold">Payment status</label>
          <select
            className="w-full p-2 border rounded"
            value={filters.paymentStatus}
            onChange={(event) =>
              onChange({ ...filters, paymentStatus: event.target.value as OrderFilters["paymentStatus"] })
            }
          >
            {paymentOptions.map((status) => (
              <option key={status || "all"} value={status}>
                {status ? status : "All"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold">Date from</label>
          <input
            type="date"
            className="w-full p-2 border rounded"
            value={filters.dateFrom}
            onChange={(event) => onChange({ ...filters, dateFrom: event.target.value })}
          />
        </div>
        <div>
          <label className="text-sm font-semibold">Date to</label>
          <input
            type="date"
            className="w-full p-2 border rounded"
            value={filters.dateTo}
            onChange={(event) => onChange({ ...filters, dateTo: event.target.value })}
          />
        </div>
      </div>

      <div className="flex justify-end mt-4 gap-2">
        <button className="btn btn-outline" onClick={onReset} disabled={isLoading}>
          Reset
        </button>
        <button className="btn btn-primary" onClick={onApply} disabled={isLoading}>
          Apply
        </button>
      </div>
    </Card>
  );
};

export default OrdersFilters;
