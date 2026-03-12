import React, { useCallback, useEffect, useState } from 'react';
import container from '../../inversify.config';
import IDENTIFIERS from '../../constants/identifiers';
import type { IApiClient } from '../../iterfaces/i-api-client';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';

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

const PaymentIssuesPage: React.FC = () => {
  const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
  const [items, setItems] = useState<PaymentIssue[]>([]);
  const [status, setStatus] = useState<'Open' | 'Resolved' | 'all'>('Open');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.api.get<PaymentIssuesResponse>('/api/admin/payments/failures', {
        params: { page, pageSize: 20, status },
      });
      setItems(data.items ?? []);
      setTotalPages(data.totalPages ?? 0);
    } catch (err) {
      console.error('Failed to load payment issues', err);
      setError('Unable to load payment issues right now.');
      setItems([]);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [apiClient.api, page, status]);

  useEffect(() => {
    load();
  }, [load]);

  const markResolved = async (paymentIntentId: string) => {
    try {
      await apiClient.api.post(`/api/admin/payments/failures/${encodeURIComponent(paymentIntentId)}/mark-resolved`);
      await load();
    } catch (err) {
      console.error('Failed to mark payment issue resolved', err);
    }
  };

  return (
    <div className="admin-grid">
      <PageHeader
        title="Payment issues"
        description="Track failed order finalizations and resolve incidents."
        breadcrumbs={['Payments', 'Issues']}
      />

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm font-semibold">Status</label>
          <select
            className="border rounded px-3 py-2"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as 'Open' | 'Resolved' | 'all');
              setPage(1);
            }}
          >
            <option value="Open">Open</option>
            <option value="Resolved">Resolved</option>
            <option value="all">All</option>
          </select>
          <button className="btn btn-outline" onClick={load} disabled={loading}>Refresh</button>
        </div>

        {loading && <p>Loading issues…</p>}
        {!loading && error && <p>{error}</p>}
        {!loading && !error && items.length === 0 && <p>No payment issues found.</p>}

        {!loading && !error && items.length > 0 && (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">PaymentIntent</th>
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Last seen</th>
                  <th className="py-2 pr-4">Attempts</th>
                  <th className="py-2 pr-4">Error</th>
                  <th className="py-2 pr-4">Reference</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.paymentIntentId} className="border-b align-top">
                    <td className="py-2 pr-4">{item.paymentIntentId}</td>
                    <td className="py-2 pr-4">{item.userId}</td>
                    <td className="py-2 pr-4">{new Date(item.lastSeenAt).toLocaleString()}</td>
                    <td className="py-2 pr-4">{item.attempts}</td>
                    <td className="py-2 pr-4">
                      <div className="font-semibold">{item.errorCode}</div>
                      <div className="text-gray-500">{item.errorMessage}</div>
                    </td>
                    <td className="py-2 pr-4">{item.traceId}</td>
                    <td className="py-2 pr-4">{item.status}</td>
                    <td className="py-2">
                      {item.status !== 'Resolved' && (
                        <button className="btn btn-outline" onClick={() => markResolved(item.paymentIntentId)}>
                          Mark resolved
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-4">
          <button className="btn btn-outline" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={loading || page <= 1}>
            Previous
          </button>
          <span>Page {page} / {Math.max(totalPages, 1)}</span>
          <button className="btn btn-outline" onClick={() => setPage((prev) => Math.min(Math.max(totalPages, 1), prev + 1))} disabled={loading || page >= totalPages}>
            Next
          </button>
        </div>
      </Card>
    </div>
  );
};

export default PaymentIssuesPage;
