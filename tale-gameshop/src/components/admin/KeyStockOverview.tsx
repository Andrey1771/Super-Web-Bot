import React, { useCallback, useEffect, useState } from 'react';
import { getKeyOverview, getOwedKeys, KeyOverview, KeyOverviewRow, OwedLine } from '../../api/adminKeysApi';

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

const KeyStockOverview: React.FC<{ onSelectGame?: (gameId: string) => void }> = ({ onSelectGame }) => {
  const [data, setData] = useState<KeyOverview | null>(null);
  const [owed, setOwed] = useState<OwedLine[]>([]);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const overview = await getKeyOverview(LOW_THRESHOLD);
      setData(overview);
      setError(false);
      // Only pull the "who's waiting" list when there are uncovered paid orders.
      if (overview.totals.awaiting > 0) {
        try { setOwed((await getOwedKeys()).lines); } catch { setOwed([]); }
      } else {
        setOwed([]);
      }
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return null;
  }

  const t = data?.totals;
  // Max available — for relative bar widths.
  const maxAvailable = Math.max(1, ...(data?.games.map((g) => g.available) ?? [1]));
  // Needs attention: awaiting a key (customer paid), out, or low.
  const attention = (data?.games ?? []).filter((g) => g.awaiting > 0 || g.outOfStock || g.low);
  const healthy = (data?.games ?? []).length - attention.length;

  return (
    <div className="admin-card">
      <h2>Key stock by game</h2>
      <p style={{ color: '#6b7280', margin: '4px 0 12px', fontSize: 13 }}>
        Where keys are low or out. Click a row to manage that game.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={tileStyle('#991b1b')}><div style={{ ...tileNum, color: (t?.awaiting ?? 0) > 0 ? '#991b1b' : '#1f2937' }}>{t?.awaiting ?? '—'}</div><div style={tileLabel}>Awaiting keys (paid)</div></div>
        <div style={tileStyle('#6b3ff2')}><div style={tileNum}>{t?.available ?? '—'}</div><div style={tileLabel}>Total in pool</div></div>
        <div style={tileStyle('#15803d')}><div style={tileNum}>{t?.delivered ?? '—'}</div><div style={tileLabel}>Delivered total</div></div>
        <div style={tileStyle('#b45309')}><div style={tileNum}>{t?.lowStock ?? '—'}</div><div style={tileLabel}>Low stock</div></div>
        <div style={tileStyle('#b91c1c')}><div style={tileNum}>{t?.outOfStock ?? '—'}</div><div style={tileLabel}>Out of stock</div></div>
      </div>

      {attention.length === 0 ? (
        <p style={{ color: '#15803d', fontSize: 14 }}>All games are stocked. 🎉</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={headStyle}>Game</th>
                <th style={headStyle}>Available</th>
                <th style={headStyle}>Awaiting</th>
                <th style={headStyle}>Delivered</th>
                <th style={headStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {attention.map((g) => {
                const s = statusOf(g);
                return (
                  <tr
                    key={g.gameId}
                    onClick={() => onSelectGame?.(g.gameId)}
                    style={{ cursor: onSelectGame ? 'pointer' : 'default' }}
                  >
                    <td style={cellStyle}>{g.title}</td>
                    <td style={cellStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 90, height: 6, borderRadius: 999, background: '#eef0f4', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.round((g.available / maxAvailable) * 100)}%`, height: '100%', background: s.fg }} />
                        </div>
                        <span style={{ fontWeight: 700, color: '#1f2937' }}>{g.available}</span>
                      </div>
                    </td>
                    <td style={cellStyle}>
                      {g.awaiting > 0
                        ? <span style={{ fontWeight: 800, color: '#991b1b' }}>{g.awaiting}</span>
                        : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td style={cellStyle}>{g.delivered}</td>
                    <td style={cellStyle}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: s.bg, color: s.fg }}>
                        {s.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {healthy > 0 && (
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 10 }}>
          {healthy} more {healthy === 1 ? 'game is' : 'games are'} fully stocked.
        </p>
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
