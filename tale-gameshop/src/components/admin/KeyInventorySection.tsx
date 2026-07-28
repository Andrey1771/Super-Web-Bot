import React, { useCallback, useEffect, useState } from 'react';
import {
  getKeyInventory,
  addKeysToInventory,
  grantKey,
  listKeys,
  voidKey,
  purgeKey,
  editKey,
  KeyInventory,
  GameKeyListItem,
} from '../../api/adminKeysApi';

const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, margin: '12px 0 4px' };
const cellStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #eef0f4', textAlign: 'left', verticalAlign: 'top' };
const headStyle: React.CSSProperties = { ...cellStyle, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280' };

const PAGE_SIZE = 25;

const KeyInventorySection: React.FC<{ gameId: string }> = ({ gameId }) => {
  const [inventory, setInventory] = useState<KeyInventory | null>(null);
  const [keysText, setKeysText] = useState('');
  const [keyType, setKeyType] = useState('CD Key');
  const [grantUser, setGrantUser] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Key list (Part B): search, status filter, pagination.
  const [items, setItems] = useState<GameKeyListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'all' | 'pool' | 'delivered' | 'voided'>('all');
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');

  const reloadCounts = useCallback(async () => {
    try {
      setInventory(await getKeyInventory(gameId));
    } catch {
      setInventory(null);
    }
  }, [gameId]);

  const loadKeys = useCallback(async () => {
    if (!gameId) {
      return;
    }
    try {
      const res = await listKeys(gameId, { query, status, page, pageSize: PAGE_SIZE });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]);
      setTotal(0);
    }
  }, [gameId, query, status, page]);

  useEffect(() => {
    setMessage(null);
    setPage(1);
    setQuery('');
    setQueryInput('');
    if (gameId) {
      reloadCounts();
    }
  }, [gameId, reloadCounts]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const refreshAll = async () => {
    await reloadCounts();
    await loadKeys();
  };

  const handleAdd = async () => {
    const keys = keysText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (keys.length === 0) {
      setMessage('Enter at least one key (one per line).');
      return;
    }
    setBusy(true);
    try {
      const res = await addKeysToInventory(gameId, keyType, keys);
      const skipped = res.skippedDuplicates ? ` Skipped duplicates: ${res.skippedDuplicates}.` : '';
      const warned = res.previouslyVoided
        ? ` ⚠ Note: ${res.previouslyVoided} of them were voided before.`
        : '';
      setMessage(`Added to pool: ${res.added}.${skipped}${warned} Available: ${res.available}.`);
      setKeysText('');
      await refreshAll();
    } catch {
      setMessage('Failed to add keys.');
    } finally {
      setBusy(false);
    }
  };

  const handleGrant = async () => {
    if (!grantUser.trim()) {
      setMessage('Enter a user email.');
      return;
    }
    setBusy(true);
    try {
      const res = await grantKey(gameId, grantUser.trim(), keyType);
      setMessage(res.granted ? `Key granted: ${res.key}` : (res.message || 'Could not grant a key.'));
      await refreshAll();
    } catch {
      setMessage('Failed to grant key.');
    } finally {
      setBusy(false);
    }
  };

  const runSearch = () => {
    setPage(1);
    setQuery(queryInput.trim());
  };

  const handleVoid = async (keyId: string) => {
    if (!window.confirm('Void this key (remove from pool)? It stays in history but will not be delivered.')) {
      return;
    }
    try {
      await voidKey(gameId, keyId);
      setMessage('Key voided.');
      await refreshAll();
    } catch {
      setMessage('Could not void the key.');
    }
  };

  const handlePurge = async (keyId: string) => {
    if (!window.confirm('Delete this key permanently? The value can be added again afterwards.')) {
      return;
    }
    try {
      await purgeKey(gameId, keyId);
      setMessage('Key deleted.');
      await refreshAll();
    } catch {
      setMessage('Could not delete the key.');
    }
  };

  const handleEdit = async (item: GameKeyListItem) => {
    const next = window.prompt('New key value:', item.key);
    if (next == null || next.trim() === '' || next.trim() === item.key) {
      return;
    }
    try {
      await editKey(gameId, item.id, { key: next.trim() });
      setMessage('Key updated.');
      await refreshAll();
    } catch (e: any) {
      setMessage(e?.response?.status === 409 ? 'That key already exists (active).' : 'Could not update the key.');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-card">
      <h2>Key inventory</h2>
      <p style={{ color: '#6b7280', margin: '4px 0 8px' }}>
        Available: <strong>{inventory?.available ?? '—'}</strong> · Delivered: <strong>{inventory?.assigned ?? '—'}</strong>
      </p>

      <label style={labelStyle}>Key type</label>
      <input className="input" value={keyType} onChange={(e) => setKeyType(e.target.value)} />

      <label style={labelStyle}>Keys to pool (one per line)</label>
      <textarea
        className="input"
        rows={5}
        value={keysText}
        onChange={(e) => setKeysText(e.target.value)}
        placeholder={'AAAAA-BBBBB-CCCCC\nDDDDD-EEEEE-FFFFF'}
      />
      <div style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={busy || !gameId}>
          Add to pool
        </button>
      </div>

      <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

      <label style={labelStyle}>Grant a key to a user (email) — test/support</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          value={grantUser}
          onChange={(e) => setGrantUser(e.target.value)}
          placeholder="user@example.com"
        />
        <button type="button" className="btn btn-outline" onClick={handleGrant} disabled={busy || !gameId}>
          Grant
        </button>
      </div>

      {message && <p style={{ marginTop: 10, color: '#374151' }}>{message}</p>}

      <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

      <h3 style={{ margin: '0 0 4px' }}>Keys</h3>
      <p style={{ color: '#6b7280', margin: '0 0 10px', fontSize: 13 }}>
        Delivered keys are masked (last 4 chars) for security.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input
          className="input"
          style={{ flex: '1 1 220px' }}
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
          placeholder="Search by key or buyer email"
        />
        <select
          className="input"
          style={{ flex: '0 0 160px' }}
          value={status}
          onChange={(e) => { setPage(1); setStatus(e.target.value as 'all' | 'pool' | 'delivered' | 'voided'); }}
        >
          <option value="all">All</option>
          <option value="pool">In pool</option>
          <option value="delivered">Delivered</option>
          <option value="voided">Voided</option>
        </select>
        <button type="button" className="btn btn-outline" onClick={runSearch} disabled={!gameId}>
          Search
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={headStyle}>Key</th>
              <th style={headStyle}>Type</th>
              <th style={headStyle}>Status</th>
              <th style={headStyle}>Buyer</th>
              <th style={headStyle}>Date</th>
              <th style={headStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td style={cellStyle} colSpan={6}>Nothing found.</td>
              </tr>
            ) : (
              items.map((it) => {
                const badge =
                  it.status === 'Pool' ? { bg: '#eef2ff', fg: '#4338ca', label: 'In pool' } :
                  it.status === 'Delivered' ? { bg: '#f0fdf4', fg: '#15803d', label: 'Delivered' } :
                  { bg: '#fef2f2', fg: '#b91c1c', label: 'Voided' };
                return (
                  <tr key={it.id}>
                    <td style={{ ...cellStyle, fontFamily: 'monospace', wordBreak: 'break-all' }}>{it.key}</td>
                    <td style={cellStyle}>{it.keyType}</td>
                    <td style={cellStyle}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                        fontSize: 12, fontWeight: 600, background: badge.bg, color: badge.fg,
                      }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={cellStyle}>{it.ownerEmail || '—'}</td>
                    <td style={cellStyle}>{it.issuedAt ? new Date(it.issuedAt).toLocaleString() : '—'}</td>
                    <td style={cellStyle}>
                      {it.status === 'Pool' && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => handleEdit(it)}>Edit</button>
                          <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => handleVoid(it.id)}>Void</button>
                          <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 13, color: '#b91c1c' }} onClick={() => handlePurge(it.id)}>Delete</button>
                        </div>
                      )}
                      {it.status === 'Voided' && (
                        <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 13, color: '#b91c1c' }} onClick={() => handlePurge(it.id)}>Delete</button>
                      )}
                      {it.status === 'Delivered' && <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <span style={{ color: '#6b7280', fontSize: 13 }}>Total: {total}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btn btn-outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Prev
          </button>
          <span style={{ fontSize: 13 }}>{page} / {totalPages}</span>
          <button type="button" className="btn btn-outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default KeyInventorySection;
