import React, { useCallback, useEffect, useState } from 'react';
import { REMOTE_PAGING } from "../../hooks/use-grid-window";
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import { DataGrid, Column, Paging, Scrolling, Sorting } from "../../components/grid";
import { GRID_PAGE_SIZE, gridStatusText, useGridWindow } from '../../hooks/use-grid-window';
import { fetchWindow } from '../../utils/page-window';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { useToast } from '../../components/ui/ToastProvider';
import { useAdminHeader } from '../../components/layout/AdminHeaderContext';
import LocalizedField, { TRANSLATION_LANGS } from '../../components/admin/LocalizedField';
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
import { formatDateTimeOrDash as formatDate } from '../../i18n/format';


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

/** Значение для <input type="datetime-local"> в локальном времени (toISOString дал бы UTC). */
const toLocalInputValue = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const NewsletterPage: React.FC = () => {
  const { addToast } = useToast();
  const { setPageTitle } = useAdminHeader();

  const [stats, setStats] = useState<AdminNewsletterStats | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  // Переводы темы и текста: подписчик получает письмо на языке своей подписки, без перевода — английское.
  const [subjectI18n, setSubjectI18n] = useState<Record<string, string>>({});
  const [bodyI18n, setBodyI18n] = useState<Record<string, string>>({});
  // Какой язык показывать в предпросмотре и слать тестом.
  const [previewLang, setPreviewLang] = useState<'en' | 'ru' | 'uk' | 'pl'>('en');
  const subjectFor = (lang: string) => (lang === 'en' ? subject : subjectI18n[lang]?.trim() || subject);
  const bodyFor = (lang: string) => (lang === 'en' ? body : bodyI18n[lang]?.trim() || body);
  const [scheduledAt, setScheduledAt] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => {
    setPageTitle('Newsletter');
  }, [setPageTitle]);

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

  // Поиск набирается посимвольно — ждём паузу, иначе запрос уходил бы на каждую букву.
  const debouncedSearch = useDebouncedValue(search, 300);

  // Окно строк для таблицы: границы приходят от неё по мере прокрутки.
  const loadSubscribers = useCallback(
    (skip: number, take: number) =>
      fetchWindow(skip, take, GRID_PAGE_SIZE, (page, pageSize) =>
        adminGetSubscribers({
          status: statusFilter || undefined,
          search: debouncedSearch.trim() || undefined,
          page,
          pageSize,
        })
      ),
    [debouncedSearch, statusFilter]
  );

  const { source, retry, loaded, total, error } = useGridWindow<AdminSubscriber>(loadSubscribers, 'id');

  useEffect(() => { loadStatsAndCampaigns(); }, [loadStatsAndCampaigns]);

  // Живой предпросмотр: сервер рендерит тем же кодом, что и реальное письмо (debounce, чтобы не дёргать API на каждый символ).
  const previewBody = bodyFor(previewLang);
  useEffect(() => {
    if (!previewBody.trim()) {
      setPreviewHtml('');
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        setPreviewHtml(await adminPreviewCampaign(previewBody, previewLang));
      } catch {
        // Предпросмотр — вспомогательная фича; ошибку не показываем, старый рендер остаётся.
      }
    }, 500);
    return () => window.clearTimeout(handle);
  }, [previewBody, previewLang]);


  const onSendTest = async () => {
    if (!testEmail.trim() || !subject.trim() || !body.trim()) {
      addToast('Fill subject, body and a test email first', 'error');
      return;
    }
    setSendingTest(true);
    try {
      await adminSendTest(testEmail.trim(), subjectFor(previewLang).trim(), bodyFor(previewLang).trim(), previewLang);
      addToast(`Test email (${previewLang.toUpperCase()}) sent to ${testEmail.trim()} (check Mailpit in dev)`, 'success');
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
      await adminCreateCampaign(subject.trim(), body.trim(), scheduledIso, subjectI18n, bodyI18n);
      addToast(
        scheduledIso
          ? `Campaign scheduled for ${new Date(scheduledIso).toLocaleString()}`
          : 'Campaign queued — the worker sends it within ~30 seconds',
        'success',
      );
      setSubject('');
      setBody('');
      setSubjectI18n({});
      setBodyI18n({});
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
        breadcrumbs={['Marketing', 'Newsletter']}
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
          <LocalizedField label="Subject" i18n={subjectI18n} onI18nChange={setSubjectI18n} placeholder={subject || 'Subject'}>
            <input
              className="h-11 w-full rounded-lg border border-gray-300 px-3"
              placeholder="Subject"
              maxLength={150}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </LocalizedField>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="grid gap-1 content-start">
              <LocalizedField label="Body" multiline rows={10} i18n={bodyI18n} onI18nChange={setBodyI18n} placeholder="Translated body; empty — subscribers of this language get the English text">
                <textarea
                  className="min-h-[220px] w-full rounded-lg border border-gray-300 p-3"
                  placeholder={'Body text.\nSupports **bold**, [link text](https://…) and plain URLs.\nExample:\nFresh deals just went live at Tale Shop…'}
                  maxLength={10000}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </LocalizedField>
              <p className="text-xs text-gray-400">
                Formatting: **bold**, [link text](https://…), bare URLs become clickable, “- ” starts a bullet.
                Subscribers get the translation for the language they subscribed in; without one they get the English text.
              </p>
            </div>
            <div className="grid gap-1 content-start">
              <label className="flex items-center gap-2 text-xs text-gray-500">
                Preview and test language:
                <select
                  className="h-8 rounded-sm border border-gray-300 px-2"
                  value={previewLang}
                  onChange={(event) => setPreviewLang(event.target.value as 'en' | 'ru' | 'uk' | 'pl')}
                >
                  <option value="en">EN</option>
                  {TRANSLATION_LANGS.map((item) => (
                    <option key={item.code} value={item.code}>{item.label}</option>
                  ))}
                </select>
              </label>
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
        {/* Рассылки приходят одним списком — сервер их не листает. Виртуальная прокрутка
            держит в DOM только видимые строки: за год ежедневный дайджест даёт сотни записей. */}
        <DataGrid
          className="mt-3"
          dataSource={campaigns}
          keyExpr="id"
          showBorders
          showRowLines
          height={360}
          width="100%"
          columnAutoWidth
          allowColumnResizing
          columnResizingMode="widget"
          noDataText="No campaigns yet"
        >
          <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
          <Paging enabled pageSize={GRID_PAGE_SIZE} />

          <Column dataField="subject" caption="Subject" minWidth={220} />
          <Column
            dataField="translations"
            caption="Languages"
            width={120}
            calculateCellValue={(row: AdminCampaign) => ["en", ...(row.translations ?? [])].join(", ").toUpperCase()}
          />
          <Column
            dataField="type"
            caption="Type"
            width={150}
            cellRender={(cell) => <span>{cell.data.type}{cell.data.locale ? ` · ${cell.data.locale}` : ''}</span>}
          />
          <Column
            dataField="status"
            caption="Status"
            width={160}
            cellRender={(cell) => (
              <span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${campaignBadgeClass[cell.data.status] ?? ''}`}>
                  {cell.data.status === 'queued' && cell.data.scheduledAt && new Date(cell.data.scheduledAt).getTime() > Date.now()
                    ? 'scheduled'
                    : cell.data.status}
                </span>
                {cell.data.status === 'queued' && cell.data.scheduledAt && (
                  <div className="mt-0.5 text-xs text-gray-400">for {formatDate(cell.data.scheduledAt)}</div>
                )}
              </span>
            )}
          />
          <Column
            caption="Sent / Failed"
            width={130}
            allowSorting={false}
            cellRender={(cell) => <span>{cell.data.sentCount} / {cell.data.failedCount}</span>}
          />
          <Column
            dataField="createdBy"
            caption="By"
            width={160}
            cellRender={(cell) => <span>{cell.data.createdBy ?? '—'}</span>}
          />
          <Column
            dataField="createdAt"
            caption="Created"
            width={170}
            cellRender={(cell) => <span>{formatDate(cell.data.createdAt)}</span>}
          />
        </DataGrid>
      </Card>

      {/* Подписчики */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Subscribers ({total ?? 0})</h3>
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
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
            <input
              className="h-9 w-56 rounded-lg border border-gray-300 px-3 text-sm"
              placeholder="Search email…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="btn btn-outline" type="button" onClick={onExport}>
              Export CSV
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-red-600">
            Failed to load subscribers.{' '}
            <button className="underline" type="button" onClick={retry}>Try again</button>
          </p>
        ) : (
          <>
            <DataGrid
              className="mt-3"
              dataSource={source}
              showBorders
              showRowLines
              height={480}
              width="100%"
              columnAutoWidth
              allowColumnResizing
              columnResizingMode="widget"
              remoteOperations={REMOTE_PAGING}
              noDataText="No subscribers found"
            >
              <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
              <Paging enabled pageSize={GRID_PAGE_SIZE} />
              {/* Порядок задаёт сервер; сортировка загруженного окна врала бы. */}
              <Sorting mode="none" />

              <Column dataField="email" caption="Email" minWidth={220} />
              <Column
                dataField="status"
                caption="Status"
                width={130}
                cellRender={(cell: { value: string }) => (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass[cell.value] ?? ''}`}>
                    {cell.value}
                  </span>
                )}
              />
              <Column
                caption="Sources"
                minWidth={160}
                cellRender={(cell: { data: AdminSubscriber }) => <span>{cell.data.sources.join(', ') || '—'}</span>}
              />
              <Column
                caption="Deal alerts"
                width={110}
                cellRender={(cell: { data: AdminSubscriber }) => (
                  <span>{cell.data.dealAlerts ? 'yes' : 'no'}</span>
                )}
              />
              <Column
                caption="Account"
                width={110}
                cellRender={(cell: { data: AdminSubscriber }) => <span>{cell.data.hasAccount ? 'yes' : '—'}</span>}
              />
              <Column
                caption="Subscribed"
                width={170}
                cellRender={(cell: { data: AdminSubscriber }) => <span>{formatDate(cell.data.createdAt)}</span>}
              />
              <Column
                caption="Confirmed"
                width={170}
                cellRender={(cell: { data: AdminSubscriber }) => <span>{formatDate(cell.data.confirmedAt)}</span>}
              />
            </DataGrid>

            <p className="mt-3 text-xs text-gray-500">{gridStatusText(loaded, total, 'subscriber')}</p>
          </>
        )}
      </Card>
    </div>
  );
};

export default NewsletterPage;
