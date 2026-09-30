import React, { useCallback, useState } from 'react';
import { REMOTE_PAGING } from "../../hooks/use-grid-window";
import { DataGrid, Column, Paging, Scrolling, Sorting } from 'devextreme-react/data-grid';
import container from '../../inversify.config';
import IDENTIFIERS from '../../constants/identifiers';
import type { IApiClient } from '../../iterfaces/i-api-client';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import { GRID_PAGE_SIZE, gridStatusText, useGridWindow } from '../../hooks/use-grid-window';
import { fetchWindow } from '../../utils/page-window';

type PaymentIssue = {
  paymentIntentId: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  attempts: number;
  errorCode: string;
  errorMessage: string;
  technicalDetails?: string;
  traceId: string;
  status: string;
  orderId?: string;
};

type PaymentIssuesResponse = {
  items: PaymentIssue[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

/**
 * Незавершённые оплаты. Инцидентов со временем накапливается сколько угодно, поэтому
 * список едет окнами по мере прокрутки, а не страницами с Previous/Next.
 */
const PaymentIssuesPage: React.FC = () => {
  const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
  const [status, setStatus] = useState<'Open' | 'Resolved' | 'all'>('Open');
  const [reloadToken, setReloadToken] = useState(0);

  const loadIssues = useCallback(
    (skip: number, take: number) =>
      fetchWindow(skip, take, GRID_PAGE_SIZE, async (page, pageSize) => {
        const { data } = await apiClient.api.get<PaymentIssuesResponse>('/api/admin/payments/failures', {
          params: { page, pageSize, status },
        });
        return { items: data.items ?? [], total: data.totalItems ?? 0 };
      }),
    [apiClient.api, status]
  );

  const { source, retry, loaded, total, error } = useGridWindow<PaymentIssue>(loadIssues, 'paymentIntentId', reloadToken);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const markResolved = async (paymentIntentId: string) => {
    try {
      await apiClient.api.post(`/api/admin/payments/failures/${encodeURIComponent(paymentIntentId)}/mark-resolved`);
      reload();
    } catch (err) {
      console.error('Failed to mark payment issue resolved', err);
    }
  };

  return (
    <div className="admin-grid">
      <PageHeader
        title="Payment issues"
        description="Track failed order finalizations and resolve incidents."
        breadcrumbs={['Sales', 'Payment issues']}
      />

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm font-semibold">Status</label>
          <select
            className="border rounded px-3 py-2"
            value={status}
            onChange={(event) => setStatus(event.target.value as 'Open' | 'Resolved' | 'all')}
          >
            <option value="Open">Open</option>
            <option value="Resolved">Resolved</option>
            <option value="all">All</option>
          </select>
          <button className="btn btn-outline" onClick={reload}>Refresh</button>
        </div>

        {error ? (
          <EmptyState
            title="Unable to load payment issues"
            description={error}
            action={
              <button className="btn btn-primary" onClick={retry}>
                Retry
              </button>
            }
          />
        ) : (
          <>
            <DataGrid
              dataSource={source}
              showBorders
              showRowLines
              height={560}
              width="100%"
              columnAutoWidth
              allowColumnResizing
              columnResizingMode="widget"
              columnHidingEnabled
              remoteOperations={REMOTE_PAGING}
              noDataText="No payment issues found."
            >
              <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
              <Paging enabled pageSize={GRID_PAGE_SIZE} />
              <Sorting mode="none" />

              <Column
                dataField="paymentIntentId"
                caption="PaymentIntent"
                minWidth={200}
                cellRender={(cell: { value: string }) => (
                  <span className="admin-table__cell-truncate" title={cell.value}>{cell.value}</span>
                )}
              />
              <Column
                dataField="userId"
                caption="User"
                minWidth={180}
                cellRender={(cell: { value: string }) => (
                  <span className="admin-table__cell-truncate" title={cell.value}>{cell.value}</span>
                )}
              />
              <Column dataField="lastSeenAt" caption="Last seen" dataType="datetime" format="dd.MM.yyyy HH:mm" width={170} />
              <Column dataField="attempts" caption="Attempts" width={100} />
              <Column
                caption="Error"
                minWidth={240}
                cellRender={(cell: { data: PaymentIssue }) => (
                  <div>
                    <div className="font-semibold">{cell.data.errorCode}</div>
                    <div className="text-gray-500 line-clamp-2" title={cell.data.errorMessage}>{cell.data.errorMessage}</div>
                  </div>
                )}
              />
              <Column
                dataField="traceId"
                caption="Reference"
                minWidth={160}
                cellRender={(cell: { value: string }) => (
                  <span className="admin-table__cell-truncate" title={cell.value}>{cell.value}</span>
                )}
              />
              <Column dataField="status" caption="Status" width={110} />
              <Column
                caption="Actions"
                width={150}
                cellRender={(cell: { data: PaymentIssue }) =>
                  cell.data.status !== 'Resolved' ? (
                    <button className="btn btn-outline admin-table-action" onClick={() => markResolved(cell.data.paymentIntentId)}>
                      Mark resolved
                    </button>
                  ) : null
                }
              />
            </DataGrid>

            <p className="mt-3 text-xs text-gray-500">{gridStatusText(loaded, total, 'issue')}</p>
          </>
        )}
      </Card>
    </div>
  );
};

export default PaymentIssuesPage;
