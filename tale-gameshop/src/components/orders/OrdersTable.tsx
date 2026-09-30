import React from "react";
import { DataGrid, Column, Paging, Scrolling, Sorting } from "../grid";
import Card from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import { GRID_PAGE_SIZE, REMOTE_PAGING, gridStatusText, useGridWindow } from "../../hooks/use-grid-window";
import type { Order } from "../../types/orders";
import { formatOrderMoney } from "../../utils/format-money";

/** Размер окна прокрутки; им же ходим на постраничный API заказов. */
export const ORDERS_PAGE_SIZE = GRID_PAGE_SIZE;

type OrdersTableProps = {
  /**
   * Загрузка окна строк. Таблица сама решает, какое окно ей нужно, и просит его по мере
   * прокрутки — страница отдаёт только запрос к серверу со своими фильтрами.
   */
  load: (skip: number, take: number) => Promise<{ items: Order[]; total: number }>;
  /**
   * Ручное обновление: смена фильтров и так меняет load, а по этой метке источник
   * пересобирается, когда меняется не запрос, а данные (Refresh, действие над заказом).
   */
  reloadToken: unknown;
  onRowClick: (order: Order) => void;
  /** Фильтры и подсказки страницы: рисуются над гридом, внутри той же карточки. */
  toolbar?: React.ReactNode;
};

/**
 * Список заказов. Раньше страница держала одну страницу результатов в состоянии и рисовала её
 * целиком, а листали кнопками «Previous/Next». Теперь строки приезжают окнами по мере прокрутки,
 * а в DOM живут только видимые — как на скидках, клиентах и журнале входов.
 */
const OrdersTable: React.FC<OrdersTableProps> = ({ load, reloadToken, onRowClick, toolbar }) => {
  const { source, retry, loaded, total, error } = useGridWindow<Order>(load, "id", reloadToken);

  if (error) {
    return (
      <Card>
        {toolbar}
        <EmptyState
          title="Unable to load orders"
          description={error}
          action={
            <button className="btn btn-primary" onClick={retry}>
              Retry
            </button>
          }
        />
      </Card>
    );
  }

  return (
    <Card>
      {toolbar}
      <DataGrid
        dataSource={source}
        showBorders
        showRowLines
        showColumnLines
        height={560}
        width="100%"
        allowColumnResizing
        columnResizingMode="widget"
        columnAutoWidth
        columnHidingEnabled
        wordWrapEnabled={false}
        remoteOperations={REMOTE_PAGING}
        noDataText="No orders found. Try adjusting your filters."
        onRowClick={(event) => onRowClick(event.data as Order)}
      >
        {/* Окна приезжают по мере прокрутки, в DOM — только видимые строки. */}
        <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
        <Paging enabled={true} pageSize={ORDERS_PAGE_SIZE} />
        {/* Порядок задаёт сервер (свежие сверху). Сортировка загруженного окна врала бы. */}
        <Sorting mode="none" />

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
        <Column dataField="createdAt" caption="Created at" dataType="datetime" format="dd.MM.yyyy HH:mm" minWidth={180} />
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
            <span>{formatOrderMoney(cellData.data.totalAmount, cellData.data.currency)}</span>
          )}
        />
        <Column
          dataField="status"
          caption="Status"
          minWidth={140}
          cellRender={(cellData: { value: Order["status"] }) => (
            <span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700">
              {(cellData.value ?? "").replace(/_/g, " ")}
            </span>
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

      <p className="mt-3 text-xs text-gray-500">{gridStatusText(loaded, total, "order")}</p>
    </Card>
  );
};

export default OrdersTable;
