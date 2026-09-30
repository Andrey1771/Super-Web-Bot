import React, { useCallback, useEffect, useRef, useState } from 'react';
import { REMOTE_PAGING } from "../../hooks/use-grid-window";
import { DataGrid, Column, Paging, Scrolling, Sorting } from 'devextreme-react/data-grid';
import { getKeyOverview, getOwedKeys, KeyOverviewRow, KeyStockStatus, OwedLine } from '../../api/adminKeysApi';
import { GRID_PAGE_SIZE, gridStatusText, useGridWindow } from '../../hooks/use-grid-window';
import { fetchWindow } from '../../utils/page-window';

const LOW_THRESHOLD = 5;

const tileStyle = (accent: string): React.CSSProperties => ({
  flex: '1 1 130px',
  padding: '12px 14px',
  borderRadius: 12,
  background: '#f8fafc',
  border: '1px solid #eef0f4',
  borderLeft: `4px solid ${accent}`,
});
const tileNum: React.CSSProperties = { fontSize: 22, fontWeight: 800, color: '#1f2937' };
const tileLabel: React.CSSProperties = { fontSize: 12, color: '#6b7280', marginTop: 2 };
const cellStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #eef0f4', textAlign: 'left', verticalAlign: 'middle' };
const headStyle: React.CSSProperties = { ...cellStyle, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280' };

const statusOf = (r: KeyOverviewRow) =>
  r.awaiting > 0 ? { bg: '#fee2e2', fg: '#991b1b', label: `Awaiting: ${r.awaiting}` } :
  r.outOfStock ? { bg: '#fef2f2', fg: '#b91c1c', label: 'Out of stock' } :
  r.low ? { bg: '#fffbeb', fg: '#b45309', label: 'Low stock' } :
  { bg: '#f0fdf4', fg: '#15803d', label: 'In stock' };

/** Фильтры статуса: по умолчанию открыт список того, ради чего экран и открывают. */
const STATUSES: Array<{ value: KeyStockStatus; label: string }> = [
  { value: 'attention', label: 'Needs attention' },
  { value: 'awaiting', label: 'Awaiting keys' },
  { value: 'out', label: 'Out of stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'ok', label: 'Fully stocked' },
  { value: 'all', label: 'All games' },
];

type Totals = { games: number; available: number; delivered: number; awaiting: number; outOfStock: number; lowStock: number };

const KeyStockOverview: React.FC<{
  /** Название передаётся вместе с id: по одному id заголовок открытой панели не написать. */
  onSelectGame?: (gameId: string, title: string) => void;
  /** Какая игра сейчас открыта — её строка подсвечена, иначе непонятно, к чему относится панель. */
  selectedGameId?: string;
}> = ({ onSelectGame, selectedGameId }) => {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [owed, setOwed] = useState<OwedLine[]>([]);
  const [status, setStatus] = useState<KeyStockStatus>('attention');
  const [search, setSearch] = useState('');
  /** Что реально ушло на сервер: ввод в поле не должен слать запрос на каждую букву. */
  const [query, setQuery] = useState('');
  /**
   * Масштаб полоски «сколько доступно». Считается по уже загруженным строкам: полоска —
   * это сравнение строк между собой, а сравнивать можно только то, что видно.
   */
  const [maxAvailable, setMaxAvailable] = useState(1);
  const maxRef = useRef(1);

  const loadRows = useCallback(
    async (skip: number, take: number) => {
      if (skip === 0) {
        maxRef.current = 1;
      }

      const window = await fetchWindow(skip, take, GRID_PAGE_SIZE, async (page, pageSize) => {
        const overview = await getKeyOverview({ lowThreshold: LOW_THRESHOLD, status, query, page, pageSize });
        setTotals(overview.totals);

        // Список «кто ждёт» тянем только когда есть оплаченные заказы без ключей,
        // и только на первом окне — он не зависит от прокрутки.
        if (page === 1) {
          if (overview.totals.awaiting > 0) {
            try {
              setOwed((await getOwedKeys()).lines);
            } catch {
              setOwed([]);
            }
          } else {
            setOwed([]);
          }
        }

        return { items: overview.games, total: overview.total };
      });

      maxRef.current = Math.max(maxRef.current, ...window.items.map((row) => row.available), 1);
      setMaxAvailable(maxRef.current);
      return window;
    },
    [query, status]
  );

  const { source, retry, loaded, total, error } = useGridWindow<KeyOverviewRow>(loadRows, 'gameId');

  // Поиск уходит на сервер с задержкой: иначе каждый символ — отдельный запрос.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="admin-card">
      <h2>Key stock by game</h2>
      <p style={{ color: '#6b7280', margin: '4px 0 12px', fontSize: 13 }}>
        Where keys are low or out. Click a row to manage that game.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={tileStyle('#991b1b')}><div style={{ ...tileNum, color: (totals?.awaiting ?? 0) > 0 ? '#991b1b' : '#1f2937' }}>{totals?.awaiting ?? '—'}</div><div style={tileLabel}>Awaiting keys (paid)</div></div>
        <div style={tileStyle('#6b3ff2')}><div style={tileNum}>{totals?.available ?? '—'}</div><div style={tileLabel}>Total in pool</div></div>
        <div style={tileStyle('#15803d')}><div style={tileNum}>{totals?.delivered ?? '—'}</div><div style={tileLabel}>Delivered total</div></div>
        <div style={tileStyle('#b45309')}><div style={tileNum}>{totals?.lowStock ?? '—'}</div><div style={tileLabel}>Low stock</div></div>
        <div style={tileStyle('#b91c1c')}><div style={tileNum}>{totals?.outOfStock ?? '—'}</div><div style={tileLabel}>Out of stock</div></div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search game…"
          style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, minWidth: 220 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUSES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatus(option.value)}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid ' + (status === option.value ? '#7c3aed' : '#e5e7eb'),
                background: status === option.value ? '#f5f3ff' : '#fff',
                color: status === option.value ? '#5b21b6' : '#6b7280',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p style={{ color: '#b91c1c', fontSize: 14 }}>
          Failed to load key stock.{' '}
          <button type="button" onClick={retry} style={{ textDecoration: 'underline', cursor: 'pointer' }}>Try again</button>
        </p>
      ) : (
        <>
          <DataGrid
            dataSource={source}
            showBorders={false}
            showRowLines
            height={460}
            width="100%"
            columnAutoWidth
            allowColumnResizing
            columnResizingMode="widget"
            remoteOperations={REMOTE_PAGING}
            noDataText={query ? `Nothing found for "${query}".` : 'All games are stocked. 🎉'}
            onRowClick={(event) => {
              const row = event.data as KeyOverviewRow;
              onSelectGame?.(row.gameId, row.title);
            }}
            onRowPrepared={(event) => {
              if (event.rowType !== 'data') {
                return;
              }
              if (onSelectGame) {
                event.rowElement.style.cursor = 'pointer';
              }
              if ((event.data as KeyOverviewRow).gameId === selectedGameId) {
                event.rowElement.classList.add('admin-table__row-selected');
              }
            }}
          >
            <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
            <Paging enabled pageSize={GRID_PAGE_SIZE} />
            {/* Порядок задаёт сервер; сортировка загруженного окна врала бы. */}
            <Sorting mode="none" />

            <Column dataField="title" caption="Game" minWidth={220} />
            <Column
              caption="Available"
              width={190}
              cellRender={(cell: { data: KeyOverviewRow }) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 90, height: 6, borderRadius: 999, background: '#eef0f4', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.round((cell.data.available / maxAvailable) * 100)}%`,
                        height: '100%',
                        background: statusOf(cell.data).fg,
                      }}
                    />
                  </div>
                  <span style={{ fontWeight: 700, color: '#1f2937' }}>{cell.data.available}</span>
                </div>
              )}
            />
            <Column
              caption="Awaiting"
              width={110}
              cellRender={(cell: { data: KeyOverviewRow }) =>
                cell.data.awaiting > 0 ? (
                  <span style={{ fontWeight: 800, color: '#991b1b' }}>{cell.data.awaiting}</span>
                ) : (
                  <span style={{ color: '#9ca3af' }}>—</span>
                )
              }
            />
            <Column dataField="delivered" caption="Delivered" width={110} />
            <Column
              caption="Status"
              width={160}
              cellRender={(cell: { data: KeyOverviewRow }) => {
                const s = statusOf(cell.data);
                return (
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: s.bg, color: s.fg }}>
                    {s.label}
                  </span>
                );
              }}
            />
          </DataGrid>

          <p style={{ marginTop: 12, color: '#6b7280', fontSize: 13 }}>
            {gridStatusText(loaded, total, 'game')}
            {status === 'attention' && total !== null && total > 0 ? ' (needing attention)' : ''}
          </p>
        </>
      )}

      {owed.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #eef0f4' }}>
          <h3 style={{ margin: '0 0 4px' }}>Who's waiting for keys</h3>
          <p style={{ color: '#6b7280', margin: '0 0 10px', fontSize: 13 }}>
            Paid orders with keys not yet delivered (longest-waiting first).
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={headStyle}>Order</th>
                  <th style={headStyle}>Buyer</th>
                  <th style={headStyle}>Game</th>
                  <th style={headStyle}>Awaiting</th>
                  <th style={headStyle}>Paid at</th>
                </tr>
              </thead>
              <tbody>
                {owed.map((l, i) => (
                  <tr key={`${l.orderNumber}-${l.gameId}-${i}`}>
                    <td style={{ ...cellStyle, fontFamily: 'monospace' }}>{l.orderNumber}</td>
                    <td style={cellStyle}>{l.buyerEmail}</td>
                    <td style={cellStyle}>{l.gameTitle}</td>
                    <td style={cellStyle}><span style={{ fontWeight: 800, color: '#991b1b' }}>{l.remaining}</span></td>
                    <td style={cellStyle}>{new Date(l.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default KeyStockOverview;
