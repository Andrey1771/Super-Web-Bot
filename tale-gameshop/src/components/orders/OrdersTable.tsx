import React from "react";
import { DataGrid, Column, Paging } from "devextreme-react/data-grid";
import Card from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import type { Order } from "../../types/orders";

type OrdersTableProps = {
  items: Order[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error?: string | null;
  onRetry: () => void;
  onRowClick: (order: Order) => void;
  onPageChange: (page: number, pageSize: number) => void;
};

const OrdersTable: React.FC<OrdersTableProps> = ({
  items,
  total,
  page,
  pageSize,
  loading,
  error,
  onRetry,
  onRowClick,
  onPageChange,
}) => {
  if (loading) {
    return (
      <Card>
        <div className="space-y-3">
          <div className="skeleton h-10" />
          <div className="skeleton h-10" />
          <div className="skeleton h-10" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <EmptyState
          title="Unable to load orders"
          description={error}
          action={
            <button className="btn btn-primary" onClick={onRetry}>
              Retry
            </button>
          }
        />
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState title="No orders found" description="Try adjusting your filters or check back later." />
      </Card>
    );
  }

  return (
    <Card>
      <DataGrid
        dataSource={items}
        showBorders
        showRowLines
        showColumnLines
        height={560}
        width="100%"
        keyExpr="id"
        allowColumnResizing
        columnResizingMode="widget"
        columnAutoWidth
        columnHidingEnabled
        wordWrapEnabled={false}
        scrolling={{ mode: "standard", showScrollbar: "always" }}
        paging={{ enabled: false }}
        onRowClick={(event) => onRowClick(event.data as Order)}
      >
        <Paging enabled={false} />
        <Column
          dataField="number"
          caption="Order #"
          minWidth={160}
          cellRender={(cellData: { value: string }) => (
            <span className="admin-table__cell-truncate" title={cellData.value}>
              {cellData.value}
            </span>
          )}
        />
        <Column dataField="createdAt" caption="Created at" dataType="datetime" format="yyyy-MM-dd HH:mm" minWidth={180} />
        <Column
          dataField="userEmail"
          caption="Customer"
          minWidth={200}
          cellRender={(cellData: { data: Order }) => (
            <span className="admin-table__cell-truncate" title={cellData.data.userEmail ?? cellData.data.userId}>
              {cellData.data.userEmail ?? cellData.data.userId}
            </span>
          )}
        />
        <Column
          caption="Items"
          minWidth={90}
          cellRender={(cellData: { data: Order }) => <span>{cellData.data.items.length}</span>}
        />
        <Column
          caption="Total"
          minWidth={140}
          cellRender={(cellData: { data: Order }) => (
            <span>
              {cellData.data.totalAmount.toFixed(2)} {cellData.data.currency}
            </span>
          )}
        />
        <Column
          dataField="status"
          caption="Status"
          minWidth={140}
          cellRender={(cellData: { value: Order["status"] }) => (
            <span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700">{cellData.value}</span>
          )}
        />
        <Column
          dataField="paymentStatus"
          caption="Payment"
          minWidth={140}
          cellRender={(cellData: { value?: Order["paymentStatus"] }) => (
            <span className="px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700">
              {cellData.value ?? "—"}
            </span>
          )}
        />
        <Column
          caption="Actions"
          width={120}
          cellRender={() => <span className="text-sm text-slate-500">View</span>}
        />
      </DataGrid>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total} orders
        </p>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Rows</label>
          <select
            className="p-2 border rounded"
            value={pageSize}
            onChange={(event) => onPageChange(1, Number(event.target.value))}
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <button
            className="btn btn-outline"
            onClick={() => onPageChange(Math.max(page - 1, 1), pageSize)}
            disabled={page === 1}
          >
            Previous
          </button>
          <button
            className="btn btn-outline"
            onClick={() => onPageChange(page + 1, pageSize)}
            disabled={page * pageSize >= total}
          >
            Next
          </button>
        </div>
      </div>
    </Card>
  );
};

export default OrdersTable;
