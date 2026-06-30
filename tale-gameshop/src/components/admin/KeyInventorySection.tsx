import React, { useEffect, useState } from 'react';
import { getKeyInventory, addKeysToInventory, grantKey, KeyInventory } from '../../api/adminKeysApi';

const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, margin: '12px 0 4px' };

const KeyInventorySection: React.FC<{ gameId: string }> = ({ gameId }) => {
  const [inventory, setInventory] = useState<KeyInventory | null>(null);
  const [keysText, setKeysText] = useState('');
  const [keyType, setKeyType] = useState('CD Key');
  const [grantUser, setGrantUser] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reload = async () => {
    try {
      setInventory(await getKeyInventory(gameId));
    } catch {
      setInventory(null);
    }
  };

  useEffect(() => {
    setMessage(null);
    if (gameId) {
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const handleAdd = async () => {
    const keys = keysText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (keys.length === 0) {
      setMessage('Введите хотя бы один ключ (по одному в строке).');
      return;
    }
    setBusy(true);
    try {
      const res = await addKeysToInventory(gameId, keyType, keys);
      setMessage(`Добавлено в пул: ${res.added}. Доступно: ${res.available}.`);
      setKeysText('');
      await reload();
    } catch {
      setMessage('Ошибка добавления ключей.');
    } finally {
      setBusy(false);
    }
  };

  const handleGrant = async () => {
    if (!grantUser.trim()) {
      setMessage('Укажите email пользователя.');
      return;
    }
    setBusy(true);
    try {
      const res = await grantKey(gameId, grantUser.trim(), keyType);
      setMessage(res.granted ? `Выдан ключ: ${res.key}` : (res.message || 'Не удалось выдать ключ.'));
      await reload();
    } catch {
      setMessage('Ошибка выдачи ключа.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-card">
      <h2>Key inventory</h2>
      <p style={{ color: '#6b7280', margin: '4px 0 8px' }}>
        Доступно: <strong>{inventory?.available ?? '—'}</strong> · Выдано: <strong>{inventory?.assigned ?? '—'}</strong>
      </p>

      <label style={labelStyle}>Тип ключа</label>
      <input className="input" value={keyType} onChange={(e) => setKeyType(e.target.value)} />

      <label style={labelStyle}>Ключи в пул (по одному в строке)</label>
      <textarea
        className="input"
        rows={5}
        value={keysText}
        onChange={(e) => setKeysText(e.target.value)}
        placeholder={'AAAAA-BBBBB-CCCCC\nDDDDD-EEEEE-FFFFF'}
      />
      <div style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={busy || !gameId}>
          Добавить в пул
        </button>
      </div>

      <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

      <label style={labelStyle}>Выдать ключ пользователю (email) — тест/поддержка</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          value={grantUser}
          onChange={(e) => setGrantUser(e.target.value)}
          placeholder="user@example.com"
        />
        <button type="button" className="btn btn-outline" onClick={handleGrant} disabled={busy || !gameId}>
          Выдать
        </button>
      </div>

      {message && <p style={{ marginTop: 10, color: '#374151' }}>{message}</p>}
    </div>
  );
};

export default KeyInventorySection;
