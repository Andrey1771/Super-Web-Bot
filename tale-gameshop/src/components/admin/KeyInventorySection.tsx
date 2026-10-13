import React, { useCallback, useEffect, useRef, useState } from 'react';
import { REMOTE_PAGING } from "../../hooks/use-grid-window";
import {
  getKeyInventory,
  addKeysToInventory,
  grantKey,
  listKeys,
  voidKey,
  purgeKey,
  editKey,
  importKeys,
  setLowStockThreshold,
  KeyInventory,
  GameKeyListItem,
  KeyImportReport,
  getGameEditions,
  setGameRegionPolicy,
} from '../../api/adminKeysApi';
import RegionPolicyEditor, { describePolicy, emptyPolicy, useRegionCatalog, type RegionPolicy } from './RegionPolicyEditor';
import { useSitePreferences } from '../../context/site-preferences';

const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, margin: '12px 0 4px' };
const cellStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #eef0f4', textAlign: 'left', verticalAlign: 'top' };
const headStyle: React.CSSProperties = { ...cellStyle, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280' };

import { DataGrid, Column, Paging, Scrolling, Sorting, type DataGridRef } from "../grid";
import { GRID_PAGE_SIZE, gridStatusText, useGridWindow } from '../../hooks/use-grid-window';
import { fetchWindow } from '../../utils/page-window';

const KeyInventorySection: React.FC<{
  gameId: string;
  /**
   * Сообщает наверх, что в формах есть несохранённое. Нужно тому, кто показывает секцию:
   * панель закрывается кликом мимо, а вставленная пачка ключей при этом пропадает молча.
   */
  onDirtyChange?: (dirty: boolean) => void;
  /** С какой лицензии (издания) начать заливку: редактор открывает ключи прямо из строки лицензии. Пусто — базовое. */
  initialEditionCode?: string;
}> = ({ gameId, onDirtyChange, initialEditionCode }) => {
  const [inventory, setInventory] = useState<KeyInventory | null>(null);
  const [keysText, setKeysText] = useState('');
  const [keyType, setKeyType] = useState('CD Key');
  // Издания игры: ключи Deluxe — отдельный пул. Пустой код — базовое издание (ключи без кода).
  const [editions, setEditions] = useState<Array<{ code: string; title: string; isDefault?: boolean }>>([]);
  const [editionCode, setEditionCode] = useState(initialEditionCode ?? '');
  // Политика активации: у партии ключей (при заливке) и у игры по умолчанию. «Use game policy» — без своей.
  const regionCatalog = useRegionCatalog();
  const [batchPolicyOn, setBatchPolicyOn] = useState(false);
  const [batchPolicy, setBatchPolicy] = useState<RegionPolicy>(emptyPolicy());
  const [gamePolicyOn, setGamePolicyOn] = useState(false);
  const [gamePolicy, setGamePolicy] = useState<RegionPolicy>(emptyPolicy());
  const batchPolicyOrNull = batchPolicyOn ? batchPolicy : null;
  // Себестоимость партии: за сколько куплен один ключ, в какой валюте и у кого.
  const [unitCost, setUnitCost] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [costCurrency, setCostCurrency] = useState('');
  const [supplier, setSupplier] = useState('');
  const { baseCurrency } = useSitePreferences();
  // Сколько ключей в поле ввода — чтобы показать стоимость всей партии до заливки.
  const keysCount = keysText.split('\n').map((line) => line.trim()).filter(Boolean).length;
  const batchCost = unitCost.trim()
    ? { unitCost: Number(unitCost), costCurrency: costCurrency.trim().toUpperCase() || undefined, supplier: supplier.trim() || undefined }
    : undefined;
  const [grantUser, setGrantUser] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Импорт из файла: содержимое → предпросмотр (dryRun) → запись. Отчёт хранится, чтобы
  // кнопка «Import» видела, что предпросмотр был по этому же содержимому.
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<KeyImportReport | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<string>('');
  // С этой даты витрина показывает «Selling fast» при любом остатке — ручной ажиотаж (распродажа).
  const [lowStockFrom, setLowStockFrom] = useState<string>('');
  const [defaultThreshold, setDefaultThreshold] = useState<number | null>(null);

  // Список ключей: поиск, фильтр статуса и окна строк по мере прокрутки.
  const [status, setStatus] = useState<'all' | 'pool' | 'delivered' | 'voided'>('all');
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');

  const reloadCounts = useCallback(async () => {
    try {
      const inv = await getKeyInventory(gameId);
      setInventory(inv);
      setGamePolicyOn(Boolean(inv.regionPolicy));
      setGamePolicy(inv.regionPolicy ? { mode: inv.regionPolicy.mode, regions: inv.regionPolicy.regions ?? [], excludedCountries: inv.regionPolicy.excludedCountries ?? [] } : emptyPolicy());
      getGameEditions(gameId).then(setEditions).catch(() => setEditions([]));
    } catch {
      setInventory(null);
    }
  }, [gameId]);

  const gridRef = useRef<DataGridRef<GameKeyListItem, string> | null>(null);

  // Несохранённым считаем набранное в полях, которое пропадёт при закрытии: пачка ключей и
  // текст импорта. Всё остальное в секции — либо уже сохранено, либо восстановимо.
  const hasUnsavedInput = keysText.trim().length > 0 || importText.trim().length > 0;
  useEffect(() => {
    onDirtyChange?.(hasUnsavedInput);
  }, [hasUnsavedInput, onDirtyChange]);

  // Окно строк для таблицы: границы приходят от неё по мере прокрутки.
  const loadKeys = useCallback(
    async (skip: number, take: number) => {
      if (!gameId) {
        return { items: [] as GameKeyListItem[], total: 0 };
      }
      return fetchWindow(skip, take, GRID_PAGE_SIZE, (page, pageSize) =>
        listKeys(gameId, { query, status, page, pageSize })
      );
    },
    [gameId, query, status]
  );

  const { source, retry, loaded, total, error: keysError } = useGridWindow<GameKeyListItem>(loadKeys, 'id');

  // Перечитать список, не сбрасывая прокрутку.
  const reloadKeys = useCallback(() => {
    gridRef.current?.instance().refresh();
  }, []);

  useEffect(() => {
    setMessage(null);
    setQuery('');
    setQueryInput('');
    if (gameId) {
      reloadCounts();
    }
  }, [gameId, reloadCounts]);

  const refreshAll = async () => {
    await reloadCounts();
    reloadKeys();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setImportText(await file.text());
    setImportFileName(file.name);
    setImportPreview(null);
  };

  const handleImportPreview = async () => {
    if (!importText.trim()) {
      setMessage('Choose a file or paste keys first.');
      return;
    }
    setBusy(true);
    try {
      setImportPreview(await importKeys(gameId, importText, keyType, true, editionCode, batchPolicyOrNull, batchCost));
    } catch (e) {
      console.error(e);
      setMessage('Preview failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleImportApply = async () => {
    setBusy(true);
    try {
      const report = await importKeys(gameId, importText, keyType, false, editionCode, batchPolicyOrNull, batchCost);
      setImportPreview(report);
      setMessage(
        `Imported ${report.added} key(s)` +
          (report.duplicates ? `, ${report.duplicates} duplicate(s) skipped` : '') +
          (report.previouslyVoided ? `, ${report.previouslyVoided} previously voided re-added` : '') +
          (report.backfilledOrders ? `; ${report.backfilledOrders} waiting order(s) delivered` : '') +
          '.'
      );
      setImportText('');
      setImportFileName(null);
      await refreshAll();
    } catch (e) {
      console.error(e);
      setMessage('Import failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleThresholdSave = async () => {
    const value = threshold.trim() === '' ? null : Number(threshold);
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      setMessage('Threshold must be a whole number ≥ 0, or empty for the default.');
      return;
    }
    setBusy(true);
    try {
      const saved = await setLowStockThreshold(gameId, value, lowStockFrom ? new Date(lowStockFrom).toISOString() : null);
      setDefaultThreshold(saved.defaultThreshold ?? null);
      setMessage(
        (value === null ? `Low-stock threshold reset to the default (${saved.defaultThreshold}).` : `Low-stock threshold set to ${value}.`) +
          (lowStockFrom ? ` “Selling fast” forced from ${lowStockFrom}.` : '')
      );
    } catch (e) {
      console.error(e);
      setMessage('Could not save the threshold.');
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    const keys = keysText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (keys.length === 0) {
      setMessage('Enter at least one key (one per line).');
      return;
    }
    setBusy(true);
    try {
      const res = await addKeysToInventory(
        gameId,
        keyType,
        keys,
        editionCode,
        batchPolicyOrNull,
        batchCost,
        salePrice.trim() ? Number(salePrice) : null,
      );
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


  return (
    <div className="admin-card">
      {/* Заголовка с названием игры здесь нет намеренно: секция открывается панелью, и её
          шапка уже говорит, чьи это ключи. Второй заголовок только дублировал бы его. */}
      <p style={{ color: '#6b7280', margin: '0 0 8px' }}>
        Available: <strong>{inventory?.available ?? '—'}</strong> · Delivered: <strong>{inventory?.assigned ?? '—'}</strong>
        {editions.length > 1 && inventory?.byEdition && (
          <span>
            {' · by edition: '}
            {editions.map((edition) => {
              const row = inventory.byEdition!.find((b) => (b.editionCode || '') === (edition.isDefault ? '' : edition.code));
              return (
                <span key={edition.code} style={{ marginRight: 8 }}>
                  {edition.title} <strong>{row?.available ?? 0}</strong>
                </span>
              );
            })}
          </span>
        )}
      </p>

      {/* Сначала — то, ради чего экран открывают: какие ключи есть. Формы добавления,
          импорта и настроек ниже: они нужны реже, а раньше из-за них список оказывался
          в самом низу, за двумя сотнями строк формы. */}

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
          onChange={(e) => setStatus(e.target.value as 'all' | 'pool' | 'delivered' | 'voided')}
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

      {keysError ? (
        <p style={{ color: '#b91c1c', fontSize: 14 }}>
          Failed to load keys.{' '}
          <button type="button" onClick={retry} style={{ textDecoration: 'underline', cursor: 'pointer' }}>Try again</button>
        </p>
      ) : (
        <>
          <DataGrid
            ref={gridRef}
            dataSource={source}
            showBorders={false}
            showRowLines
            height={460}
            width="100%"
            columnAutoWidth
            allowColumnResizing
            columnResizingMode="widget"
            remoteOperations={REMOTE_PAGING}
            noDataText="Nothing found."
          >
            <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
            <Paging enabled pageSize={GRID_PAGE_SIZE} />
            {/* Порядок задаёт сервер; сортировка загруженного окна врала бы. */}
            <Sorting mode="none" />

            <Column
              dataField="key"
              caption="Key"
              minWidth={200}
              cellRender={(cell) => (
                <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{cell.value}</span>
              )}
            />
            <Column
              caption="Type"
              minWidth={160}
              cellRender={(cell) => (
                <span>
                  {cell.data.keyType}
                  {cell.data.editionCode ? <span style={{ color: '#6b7280' }}> · {cell.data.editionCode}</span> : null}
                  {cell.data.regionSummary ? <span style={{ color: '#6b7280' }}> · {cell.data.regionSummary}</span> : null}
                </span>
              )}
            />
            <Column
              dataField="status"
              caption="Status"
              width={130}
              cellRender={(cell) => {
                const badge =
                  cell.value === 'Pool' ? { bg: '#eef2ff', fg: '#4338ca', label: 'In pool' } :
                  cell.value === 'Delivered' ? { bg: '#f0fdf4', fg: '#15803d', label: 'Delivered' } :
                  { bg: '#fef2f2', fg: '#b91c1c', label: 'Voided' };
                return (
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: badge.bg, color: badge.fg }}>
                    {badge.label}
                  </span>
                );
              }}
            />
            <Column
              caption="Cost"
              width={120}
              cellRender={(cell) => (
                /* Прочерк означает «цена неизвестна», а не «бесплатно»: у ключей, залитых до
                   появления учёта, себестоимости нет, и в отчёте они пойдут отдельной строкой,
                   а не занизят расходы нулями. */
                <span title={cell.data.supplier ? `Supplier: ${cell.data.supplier}` : undefined}>
                  {cell.data.unitCost === null || cell.data.unitCost === undefined ? (
                    <span style={{ color: '#9ca3af' }} title="Purchase price unknown">—</span>
                  ) : (
                    <>
                      {cell.data.unitCost.toFixed(2)} <span style={{ color: '#6b7280' }}>{cell.data.costCurrency}</span>
                    </>
                  )}
                </span>
              )}
            />
            <Column
              caption="Buyer"
              minWidth={180}
              cellRender={(cell) => <span>{cell.data.ownerEmail || '—'}</span>}
            />
            <Column
              caption="By"
              minWidth={140}
              cellRender={(cell) => (
                <span
                  style={{ fontSize: 12, color: '#6b7280' }}
                  title={[cell.data.addedBy && `added by ${cell.data.addedBy}`, cell.data.issuedBy && `granted by ${cell.data.issuedBy}`].filter(Boolean).join(' · ')}
                >
                  {cell.data.issuedBy ? `✋ ${cell.data.issuedBy}` : cell.data.addedBy ? cell.data.addedBy : '—'}
                </span>
              )}
            />
            <Column
              caption="Date"
              width={170}
              cellRender={(cell) => <span>{cell.data.issuedAt ? new Date(cell.data.issuedAt).toLocaleString() : '—'}</span>}
            />
            <Column
              caption="Actions"
              width={220}
              cellRender={(cell) => (
                <>
                  {cell.data.status === 'Pool' && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => handleEdit(cell.data)}>Edit</button>
                      <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => handleVoid(cell.data.id)}>Void</button>
                      <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 13, color: '#b91c1c' }} onClick={() => handlePurge(cell.data.id)}>Delete</button>
                    </div>
                  )}
                  {cell.data.status === 'Voided' && (
                    <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 13, color: '#b91c1c' }} onClick={() => handlePurge(cell.data.id)}>Delete</button>
                  )}
                  {cell.data.status === 'Delivered' && <span style={{ color: '#9ca3af' }}>—</span>}
                </>
              )}
            />
          </DataGrid>

          <p style={{ marginTop: 10, color: '#6b7280', fontSize: 13 }}>{gridStatusText(loaded, total, 'key')}</p>
        </>
      )}

      <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

      <h3 style={{ margin: '0 0 4px' }}>Add keys</h3>

      <label style={labelStyle}>Key type</label>
      <input className="input" value={keyType} onChange={(e) => setKeyType(e.target.value)} />

      {editions.length > 1 && (
        <>
          <label style={labelStyle}>Edition</label>
          {/* Базовое издание — ключи без кода: так заливалось всё до появления изданий, и чекаут выдаёт их
              покупателям Standard. Остальные издания — свой пул под своим кодом. */}
          <select className="input" value={editionCode} onChange={(e) => setEditionCode(e.target.value)}>
            {editions.map((edition) => (
              <option key={edition.code} value={edition.isDefault ? '' : edition.code}>
                {edition.title}{edition.isDefault ? ' (base — keys without edition)' : ''}
              </option>
            ))}
          </select>
        </>
      )}

      <label style={labelStyle}>Activation region for this batch</label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
        <input type="checkbox" checked={batchPolicyOn} onChange={(e) => setBatchPolicyOn(e.target.checked)} />
        This batch has its own region policy (otherwise the game policy below applies: {describePolicy(gamePolicyOn ? gamePolicy : null, regionCatalog)})
      </label>
      {batchPolicyOn && <RegionPolicyEditor value={batchPolicy} onChange={setBatchPolicy} regions={regionCatalog} />}

      {/* Цена продажи региона. Не путать с закупочной ниже: эта — сколько платит покупатель.
          Пусто — регион продаётся по цене игры, и это нормальный случай: региональная цена
          нужна лишь там, где ключи разных областей закупались по разной цене. */}
      <label style={labelStyle}>Sale price for this region (optional)</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          type="number"
          min={0}
          step="0.01"
          placeholder={`same as the game price`}
          style={{ flex: '1 1 160px' }}
          value={salePrice}
          onChange={(e) => setSalePrice(e.target.value)}
        />
        <span style={{ fontSize: 12, color: '#6b7280' }}>{baseCurrency}</span>
      </div>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>
        What the buyer pays for a key from this region. Leave empty to sell it at the game price.
      </p>

      {/* Себестоимость партии. Необязательна: если закупочную цену ещё не знают, заливка не
          должна из-за этого вставать. Но без неё прибыль по этим ключам не посчитается —
          об этом сказано прямо под полями, а не молчанием. */}
      <label style={labelStyle}>Purchase cost (per key)</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="input"
          type="number"
          min={0}
          step="0.01"
          placeholder="e.g. 12.40"
          style={{ flex: '1 1 140px' }}
          value={unitCost}
          onChange={(e) => setUnitCost(e.target.value)}
        />
        <input
          className="input"
          placeholder={baseCurrency}
          style={{ flex: '0 1 90px' }}
          value={costCurrency}
          onChange={(e) => setCostCurrency(e.target.value)}
        />
        <input
          className="input"
          placeholder="Supplier (optional)"
          style={{ flex: '2 1 200px' }}
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
        />
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
        {unitCost.trim()
          ? `${keysCount || 0} key(s) × ${unitCost} ${costCurrency.trim().toUpperCase() || baseCurrency} = ${(Number(unitCost) * (keysCount || 0)).toFixed(2)} ${costCurrency.trim().toUpperCase() || baseCurrency} for this batch.`
          : `Leave empty if the purchase price is unknown — these keys will be excluded from profit reports. Currency defaults to ${baseCurrency}.`}
      </div>

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

      {/* Импорт из файла: сначала предпросмотр — сколько добавится, дублей, невалидных — потом
          запись. Textarea выше остаётся для пары ключей руками; файл — для сотен от поставщика. */}
      <label style={labelStyle}>Import from file (.txt / .csv — one key per line, or key,type)</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="file" accept=".txt,.csv,.tsv,text/plain,text/csv" onChange={handleImportFile} disabled={busy} />
        {importFileName && <span style={{ fontSize: 13, color: '#6b7280' }}>{importFileName} · {importText.split('\n').filter((l) => l.trim()).length} lines</span>}
        <button type="button" className="btn btn-outline" onClick={handleImportPreview} disabled={busy || !importText.trim()}>
          Preview
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleImportApply}
          disabled={busy || !importPreview || !importPreview.dryRun || importPreview.wouldAdd === 0}
          title={!importPreview ? 'Preview first' : importPreview.wouldAdd === 0 ? 'Nothing new to add' : `Add ${importPreview.wouldAdd} key(s)`}
        >
          Import{importPreview?.dryRun && importPreview.wouldAdd > 0 ? ` ${importPreview.wouldAdd}` : ''}
        </button>
      </div>
      {importPreview && (
        <div style={{ marginTop: 8, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
          <strong>{importPreview.dryRun ? 'Preview' : 'Result'}:</strong>{' '}
          {importPreview.parsed} parsed · <span style={{ color: '#15803d' }}>{importPreview.dryRun ? importPreview.wouldAdd : importPreview.added} to add</span>
          {importPreview.duplicates > 0 && <> · <span style={{ color: '#b45309' }}>{importPreview.duplicates} duplicate(s)</span></>}
          {importPreview.previouslyVoided > 0 && <> · <span style={{ color: '#b45309' }}>{importPreview.previouslyVoided} previously voided</span></>}
          {importPreview.invalid > 0 && (
            <>
              {' '}· <span style={{ color: '#b91c1c' }}>{importPreview.invalid} invalid</span>
              {importPreview.invalidSamples.length > 0 && (
                <span style={{ color: '#6b7280' }}> (e.g. {importPreview.invalidSamples.map((s) => `“${s}”`).join(', ')})</span>
              )}
            </>
          )}
          {importPreview.types && importPreview.types.length > 1 && (
            <span style={{ color: '#6b7280' }}> · types: {importPreview.types.map((t) => `${t.keyType} ×${t.count}`).join(', ')}</span>
          )}
        </div>
      )}

      <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

      <label style={labelStyle}>Activation region for this game (default for keys without their own)</label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
        <input type="checkbox" checked={gamePolicyOn} onChange={(e) => setGamePolicyOn(e.target.checked)} />
        Restrict activation region (unchecked — keys work anywhere)
      </label>
      {gamePolicyOn && <RegionPolicyEditor value={gamePolicy} onChange={setGamePolicy} regions={regionCatalog} />}
      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await setGameRegionPolicy(gameId, gamePolicyOn ? gamePolicy : null);
              setMessage(`Region policy saved: ${describePolicy(gamePolicyOn ? gamePolicy : null, regionCatalog)}.`);
              await reloadCounts();
            } catch (e) {
              console.error(e);
              setMessage('Could not save the region policy.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Save region policy
        </button>
        {inventory?.byRegion && inventory.byRegion.length > 0 && (
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            In pool by region:{' '}
            {inventory.byRegion.map((row) => (
              <span key={`${row.summary}-${row.editionCode}`} style={{ marginRight: 10 }}>
                {row.summary}
                {row.editionCode ? ` (${row.editionCode})` : ''} <strong>{row.available}</strong>
              </span>
            ))}
          </span>
        )}
      </div>

      <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

      <label style={labelStyle}>“Selling fast” for this game</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13 }}>Threshold</span>
        <input className="input" style={{ width: 120 }} type="number" min={0} placeholder={defaultThreshold === null ? 'default' : `default (${defaultThreshold})`} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        <span style={{ fontSize: 13 }}>or force from</span>
        <input className="input" style={{ width: 180 }} type="date" value={lowStockFrom} onChange={(e) => setLowStockFrom(e.target.value)} />
        <button type="button" className="btn btn-outline" onClick={handleThresholdSave} disabled={busy}>Save</button>
      </div>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 0' }}>
        Storefront shows “Selling fast” when free keys are at or below the threshold (empty = site default from Settings), or from the chosen date regardless of stock — handy for a sale or the end of a key batch.
      </p>

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

    </div>
  );
};

export default KeyInventorySection;
