import React, { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import { useToast } from '../../components/ui/ToastProvider';
import { useAdminHeader } from '../../components/layout/AdminHeaderContext';
import {
  adminCreateCampaign,
  adminDownloadSubscribersCsv,
  adminGetCampaigns,
  adminGetNewsletterStats,
  adminGetSubscribers,
  adminPreviewCampaign,
  adminSendTest,
  type AdminCampaign,
  type AdminNewsletterStats,
  type AdminSubscriber,
} from '../../api/newsletterApi';

const PAGE_SIZE = 25;

const statusFilters = [
  { value: '', label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending', label: 'Pending' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
];

const statusBadgeClass: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  unsubscribed: 'bg-gray-200 text-gray-600',
};

const campaignBadgeClass: Record<string, string> = {
  queued: 'bg-amber-100 text-amber-700',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString() : '—');

/** Значение для <input type="datetime-local"> в локальном времени (toISOString дал бы UTC). */
const toLocalInputValue = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const NewsletterPage: React.FC = () => {
  const { addToast } = useToast();
  const { setHeaderActions, setPageTitle } = useAdminHeader();

  const [stats, setStats] = useState<AdminNewsletterStats | null>(null);
  const [subscribers, setSubscribers] = useState<AdminSubscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => {
    setPageTitle('Newsletter');
    setHeaderActions([]);
    return () => setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

  const loadStatsAndCampaigns = useCallback(async () => {
    try {
      const [nextStats, nextCampaigns] = await Promise.all([
        adminGetNewsletterStats(),
        adminGetCampaigns(),
      ]);
      setStats(nextStats);
      setCampaigns(nextCampaigns);
    } catch {
      addToast('Failed to load newsletter stats', 'error');
    }
  }, [addToast]);

  const loadSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminGetSubscribers({
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setSubscribers(data.items);
      setTotal(data.total);
    } catch {
      addToast('Failed to load subscribers', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, page, search, statusFilter]);

  useEffect(() => { loadStatsAndCampaigns(); }, [loadStatsAndCampaigns]);
  useEffect(() => { loadSubscribers(); }, [loadSubscribers]);

  // Живой предпросмотр: сервер рендерит тем же кодом, что и реальное письмо (debounce, чтобы не дёргать API на каждый символ).
  useEffect(() => {
    if (!body.trim()) {
      setPreviewHtml('');
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        setPreviewHtml(await adminPreviewCampaign(body));
      } catch {
        // Предпросмотр — вспомогательная фича; ошибку не показываем, старый рендер остаётся.
      }
    }, 500);
    return () => window.clearTimeout(handle);
  }, [body]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const onSendTest = async () => {
    if (!testEmail.trim() || !subject.trim() || !body.trim()) {
      addToast('Fill subject, body and a test email first', 'error');
      return;
    }
    setSendingTest(true);
    try {
      await adminSendTest(testEmail.trim(), subject.trim(), body.trim());
      addToast(`Test email sent to ${testEmail.trim()} (check MailHog in dev)`, 'success');
    } catch (error: any) {
      addToast(error?.response?.data?.error ?? 'Failed to send test email', 'error');
    } finally {
      setSendingTest(false);
    }
  };

  const onQueueCampaign = async () => {
    if (!subject.trim() || !body.trim()) {
      addToast('Subject and body are required', 'error');
      return;
    }

    let scheduledIso: string | undefined;
    if (scheduledAt) {
      const when = new Date(scheduledAt);
      if (when.getTime() < Date.now()) {
        addToast('Scheduled time is in the past', 'error');
        return;
      }
      scheduledIso = when.toISOString();
    }

    const confirmedCount = stats?.confirmed ?? 0;
    // Рассылка — необратимое действие: подтверждаем явно.
    const question = scheduledIso
      ? `Schedule this campaign for ${new Date(scheduledIso).toLocaleString()} (${confirmedCount} confirmed subscriber(s) today)?`
      : `Send this campaign to ${confirmedCount} confirmed subscriber(s)?`;
    if (!window.confirm(question)) {
      return;
    }
    setQueuing(true);
    try {
      await adminCreateCampaign(subject.trim(), body.trim(), scheduledIso);
      addToast(
        scheduledIso
          ? `Campaign scheduled for ${new Date(scheduledIso).toLocaleString()}`
          : 'Campaign queued — the worker sends it within ~30 seconds',
        'success',
      );
      setSubject('');
      setBody('');
      setScheduledAt('');
      await loadStatsAndCampaigns();
    } catch (error: any) {
      addToast(error?.response?.data?.error ?? 'Failed to queue campaign', 'error');
    } finally {
      setQueuing(false);
    }
  };

  const onExport = async () => {
    try {
      await adminDownloadSubscribersCsv();
    } catch {
      addToast('Export failed', 'error');
    }
  };

  return (
    <div className="admin-grid">
      <PageHeader
        title="Newsletter"
        description="Deal alerts & newsletter: subscribers, campaigns and the automatic deals digest."
        breadcrumbs={['Newsletter', 'Admin']}
      />

      {/* Статистика */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Confirmed', value: stats?.confirmed ?? '—' },
          { label: 'Pending confirmation', value: stats?.pending ?? '—' },
          { label: 'Unsubscribed', value: stats?.unsubscribed ?? '—' },
          { label: 'New in 30 days', value: stats?.newLast30Days ?? '—' },
        ].map((item) => (
          <Card key={item.label}>
            <p className="text-sm text-gray-500">{item.label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{item.value}</p>
          </Card>
        ))}
      </div>

      {/* Кампания */}
      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-lg font-semibold">Compose campaign</h3>
          <span className="text-sm text-gray-500">
            Recipients: confirmed subscribers ({stats?.confirmed ?? 0}). Every email includes an unsubscribe link.
          </span>
        </div>
        <div className="mt-4 grid gap-3">
          <input
            className="h-11 rounded-lg border border-gray-300 px-3"
            placeholder="Subject"
            maxLength={150}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="grid gap-1 content-start">
              <textarea
                className="min-h-[220px] rounded-lg border border-gray-300 p-3"
                placeholder={'Body text.\nSupports **bold**, [link text](https://…) and plain URLs.\nExample:\nFresh deals just went live at Tale Shop…'}
                maxLength={10000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              <p className="text-xs text-gray-400">
                Formatting: **bold**, [link text](https://…), bare URLs become clickable, “- ” starts a bullet.
              </p>
            </div>
            <div className="grid gap-1 content-start">
              {previewHtml ? (
                <iframe
                  title="Email preview"
                  className="min-h-[220px] w-full rounded-lg border border-gray-200 bg-gray-50"
                  sandbox=""
                  srcDoc={previewHtml}
                />
              ) : (
                <div className="min-h-[220px] rounded-lg border border-dashed border-gray-300 grid place-items-center text-sm text-gray-400">
                  Email preview appears here as you type
                </div>
              )}
              <p className="text-xs text-gray-400">
                Preview is rendered by the server — exactly what subscribers will receive (with their personal unsubscribe link).
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="h-11 w-64 rounded-lg border border-gray-300 px-3"
              placeholder="Test recipient email"
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
            />
            <button className="btn btn-outline" type="button" onClick={onSendTest} disabled={sendingTest}>
              {sendingTest ? 'Sending…' : 'Send test'}
            </button>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Schedule (optional):
              <input
                type="datetime-local"
                className="h-11 rounded-lg border border-gray-300 px-3"
                min={toLocalInputValue(new Date())}
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>
            <button className="btn btn-primary" type="button" onClick={onQueueCampaign} disabled={queuing}>
              {queuing
                ? 'Queuing…'
                : scheduledAt
                  ? 'Schedule campaign'
                  : `Send to ${stats?.confirmed ?? 0} subscribers`}
            </button>
          </div>
        </div>
      </Card>

      {/* История кампаний */}
      <Card>
        <h3 className="text-lg font-semibold">Campaigns</h3>
        <p className="text-sm text-gray-500 mt-1">
          Manual campaigns and the automatic deals digest (runs daily when new discounts go live).
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Subject</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Sent / Failed</th>
                <th className="py-2 pr-3">By</th>
                <th className="py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">No campaigns yet</td></tr>
              )}
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{campaign.subject}</td>
                  <td className="py-2 pr-3">{campaign.type}{campaign.locale ? ` · ${campaign.locale}` : ''}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${campaignBadgeClass[campaign.status] ?? ''}`}>
                      {campaign.status === 'queued' && campaign.scheduledAt && new Date(campaign.scheduledAt).getTime() > Date.now()
                        ? 'scheduled'
                        : campaign.status}
                    </span>
                    {campaign.status === 'queued' && campaign.scheduledAt && (
                      <div className="mt-0.5 text-xs text-gray-400">for {formatDate(campaign.scheduledAt)}</div>
                    )}
                  </td>
                  <td className="py-2 pr-3">{campaign.sentCount} / {campaign.failedCount}</td>
                  <td className="py-2 pr-3">{campaign.createdBy ?? '—'}</td>
                  <td className="py-2">{formatDate(campaign.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Подписчики */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Subscribers ({total})</h3>
          <div className="flex flex-wrap items-center gap-2">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`rounded-full px-3 py-1 text-sm font-medium border ${
                  statusFilter === filter.value
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-gray-600 border-gray-300'
                }`}
                onClick={() => { setStatusFilter(filter.value); setPage(1); }}
              >
                {filter.label}
              </button>
            ))}
            <input
              className="h-9 w-56 rounded-lg border border-gray-300 px-3 text-sm"
              placeholder="Search email…"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            />
            <button className="btn btn-outline" type="button" onClick={onExport}>
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Sources</th>
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Subscribed</th>
                <th className="py-2">Confirmed</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Loading…</td></tr>
              )}
              {!loading && subscribers.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">No subscribers found</td></tr>
              )}
              {!loading && subscribers.map((subscriber) => (
                <tr key={subscriber.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{subscriber.email}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass[subscriber.status] ?? ''}`}>
                      {subscriber.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{subscriber.sources.join(', ') || '—'}</td>
                  <td className="py-2 pr-3">{subscriber.hasAccount ? 'yes' : '—'}</td>
                  <td className="py-2 pr-3">{formatDate(subscriber.createdAt)}</td>
                  <td className="py-2">{formatDate(subscriber.confirmedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              className="btn btn-outline"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              ← Prev
            </button>
            <button
              className="btn btn-outline"
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next →
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default NewsletterPage;
