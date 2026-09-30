import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader, { GAMES_TABS } from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import { DataGrid, Column, Paging, Scrolling } from "../../components/grid";
import { GRID_PAGE_SIZE } from '../../hooks/use-grid-window';
import { useToast } from '../../components/ui/ToastProvider';
import { useAdminHeader } from '../../components/layout/AdminHeaderContext';
import container from '../../inversify.config';
import IDENTIFIERS from '../../constants/identifiers';
import type { IAdminPromoCodesService } from '../../iterfaces/i-admin-promo-codes-service';
import type { PromoCode, PromoCodePayload, PromoCodeType } from '../../types/promo-codes';
import { getFxOverview } from '../../api/adminFxApi';
import { formatMoney } from '../../utils/format-money';
import './promo-codes-page.css';

/**
 * Промокоды. Абсолютные суммы (fixed-скидка, минимальный заказ, потолок скидки) — в валюте:
 * промокод «−200 ₽» не должен применяться к корзине в долларах и наоборот. Бэкенд это уже
 * проверяет (PromoCode.AppliesToCurrency); здесь валюта стала видна и обязательна там, где
 * есть хоть одна абсолютная сумма.
 */

const today = () => new Date().toISOString().slice(0, 10);

const emptyPayload = (currency: string): PromoCodePayload => ({
  code: '', type: 'percentage', value: 10, currency: null, minOrderAmount: null, maxDiscountAmount: null,
  firstOrderOnly: false, startDate: today(), endDate: today(), usageLimit: null, usagePerUser: null,
});

const PromoCodesPage: React.FC = () => {
  const service = container.get<IAdminPromoCodesService>(IDENTIFIERS.IAdminPromoCodesService);
  const { addToast } = useToast();
  const { setPageTitle } = useAdminHeader();
  const [items, setItems] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [draft, setDraft] = useState<PromoCodePayload>(emptyPayload('USD'));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCurrency, setFilterCurrency] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await service.getAll());
    } catch {
      addToast('Failed to load promo codes', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, service]);

  useEffect(() => {
    load();
    // Список валют — тот же, что у витрины: промокод в валюте, которой магазин не торгует, не нужен.
    getFxOverview()
      .then((fx) => {
        setCurrencies(fx.supportedCurrencies);
        setBaseCurrency(fx.baseCurrency);
      })
      .catch(() => setCurrencies(['USD']));
  }, [load]);

  useEffect(() => {
    setPageTitle('Promo codes');
  }, [setPageTitle]);

  const hasAbsolute = draft.type === 'fixed' || draft.minOrderAmount != null || draft.maxDiscountAmount != null;

  const onSubmit = async () => {
    if (!draft.code.trim()) {
      addToast('Enter a code.', 'error');
      return;
    }
    if (hasAbsolute && !draft.currency) {
      addToast('Pick a currency: fixed discount, min order and max discount are amounts in a specific currency.', 'error');
      return;
    }
    // Чисто процентный без порогов — валюта не имеет смысла, не отправляем.
    const payload: PromoCodePayload = { ...draft, code: draft.code.trim().toUpperCase(), currency: hasAbsolute ? draft.currency : null };
    try {
      if (editingId) {
        await service.update(editingId, payload);
        addToast('Promo code updated', 'success');
      } else {
        await service.create(payload);
        addToast('Promo code created', 'success');
      }
      setDraft(emptyPayload(baseCurrency));
      setEditingId(null);
      await load();
    } catch (error: any) {
      addToast(error?.response?.data?.message ?? 'Failed to save promo code', 'error');
    }
  };

  const onEdit = (item: PromoCode) => {
    setEditingId(item.id);
    setDraft({
      code: item.code,
      type: item.type,
      value: item.value,
      currency: item.currency ?? null,
      minOrderAmount: item.minOrderAmount ?? null,
      maxDiscountAmount: item.maxDiscountAmount ?? null,
      firstOrderOnly: item.firstOrderOnly,
      startDate: item.startDate.slice(0, 10),
      endDate: item.endDate.slice(0, 10),
      usageLimit: item.usageLimit ?? null,
      usagePerUser: item.usagePerUser ?? null,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onDelete = async (item: PromoCode) => {
    if (!window.confirm(`Delete promo code ${item.code}? Customers will no longer be able to use it.`)) {
      return;
    }
    await service.remove(item.id);
    addToast('Promo code deleted', 'success');
    await load();
  };

  const setNumber = (field: keyof PromoCodePayload, value: string) =>
    setDraft((prev) => ({ ...prev, [field]: value === '' ? null : Number(value) }));

  const visible = useMemo(
    () => (filterCurrency ? items.filter((i) => (i.currency ?? '') === filterCurrency) : items),
    [filterCurrency, items]
  );

  const describeValue = (item: PromoCode) =>
    item.type === 'percentage' ? `${item.value}%` : formatMoney(item.value, item.currency ?? baseCurrency);

  return (
    <div className="admin-grid promo">
      <PageHeader title="Promo codes" description="Checkout promo campaigns. Amounts are per currency." breadcrumbs={['Marketing', 'Promo codes']} tabs={GAMES_TABS} />

      <Card>
        <h3>{editingId ? 'Edit promo code' : 'New promo code'}</h3>
        <div className="promo__form">
          <label>Code<input className="input" placeholder="SUMMER10" value={draft.code} onChange={(e) => setDraft((prev) => ({ ...prev, code: e.target.value }))} /></label>
          <label>Type
            <select className="input" value={draft.type} onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value as PromoCodeType }))}>
              <option value="percentage">Percentage off</option>
              <option value="fixed">Fixed amount off</option>
            </select>
          </label>
          <label>{draft.type === 'percentage' ? 'Percent' : 'Amount'}
            <input className="input" type="number" min={0} step="any" value={draft.value} onChange={(e) => setDraft((prev) => ({ ...prev, value: Number(e.target.value) }))} />
          </label>
          <label className={hasAbsolute ? 'promo__required' : ''}>Currency{hasAbsolute ? ' *' : ''}
            <select className="input" value={draft.currency ?? ''} onChange={(e) => setDraft((prev) => ({ ...prev, currency: e.target.value || null }))} disabled={!hasAbsolute}>
              <option value="">{hasAbsolute ? 'Pick…' : 'any (percentage only)'}</option>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>Min order<input className="input" type="number" min={0} step="any" placeholder="none" value={draft.minOrderAmount ?? ''} onChange={(e) => setNumber('minOrderAmount', e.target.value)} /></label>
          <label>Max discount<input className="input" type="number" min={0} step="any" placeholder="none" value={draft.maxDiscountAmount ?? ''} onChange={(e) => setNumber('maxDiscountAmount', e.target.value)} /></label>
          <label>Starts<input className="input" type="date" value={draft.startDate} onChange={(e) => setDraft((prev) => ({ ...prev, startDate: e.target.value }))} /></label>
          <label>Ends<input className="input" type="date" value={draft.endDate} onChange={(e) => setDraft((prev) => ({ ...prev, endDate: e.target.value }))} /></label>
          <label>Usage limit<input className="input" type="number" min={0} placeholder="unlimited" value={draft.usageLimit ?? ''} onChange={(e) => setNumber('usageLimit', e.target.value)} /></label>
          <label>Per user<input className="input" type="number" min={0} placeholder="unlimited" value={draft.usagePerUser ?? ''} onChange={(e) => setNumber('usagePerUser', e.target.value)} /></label>
          <label className="promo__check"><input type="checkbox" checked={draft.firstOrderOnly} onChange={(e) => setDraft((prev) => ({ ...prev, firstOrderOnly: e.target.checked }))} /> First order only</label>
        </div>
        {hasAbsolute && (
          <p className="promo__hint">
            This code carries amounts in {draft.currency ?? '…'} and will apply only to carts in that currency.
          </p>
        )}
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={onSubmit}>{editingId ? 'Update' : 'Create'}</button>
          {editingId && <button className="btn btn-outline" onClick={() => { setEditingId(null); setDraft(emptyPayload(baseCurrency)); }}>Cancel edit</button>}
        </div>
      </Card>

      <Card>
        <div className="promo__list-head">
          <h3>Codes ({visible.length})</h3>
          <select className="input promo__filter" value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value)}>
            <option value="">All currencies</option>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : (
          /* Промокоды приходят одним списком — их немного, сервер не листает. Виртуальная
             прокрутка нужна другому: держать в DOM только видимые строки, когда кодов
             накопятся сотни. Сортировка тут честная — в браузере лежит весь список. */
          <DataGrid
            dataSource={visible}
            keyExpr="id"
            showBorders
            showRowLines
            height={520}
            width="100%"
            columnAutoWidth
            allowColumnResizing
            columnResizingMode="widget"
            noDataText="No promo codes."
            onRowPrepared={(event) => {
              if (event.rowType === 'data' && !(event.data as PromoCode).isActive) {
                event.rowElement.classList.add('promo__inactive');
              }
            }}
          >
            <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
            <Paging enabled pageSize={GRID_PAGE_SIZE} />

            <Column
              dataField="code"
              caption="Code"
              minWidth={160}
              cellRender={(cell) => (
                <span>
                  <strong>{cell.data.code}</strong>
                  {cell.data.firstOrderOnly && <span className="promo__pill">1st order</span>}
                </span>
              )}
            />
            <Column
              caption="Discount"
              minWidth={140}
              allowSorting={false}
              cellRender={(cell) => <span>{describeValue(cell.data)}</span>}
            />
            <Column
              dataField="currency"
              caption="Currency"
              width={110}
              cellRender={(cell) => <span>{cell.data.currency ?? <span className="promo__muted">any</span>}</span>}
            />
            <Column
              caption="Limits"
              minWidth={180}
              allowSorting={false}
              cellRender={(cell) => (
                <span className="promo__muted">
                  {cell.data.minOrderAmount != null ? `min ${formatMoney(cell.data.minOrderAmount, cell.data.currency ?? baseCurrency)}` : ''}
                  {cell.data.minOrderAmount != null && cell.data.maxDiscountAmount != null ? ' · ' : ''}
                  {cell.data.maxDiscountAmount != null ? `cap ${formatMoney(cell.data.maxDiscountAmount, cell.data.currency ?? baseCurrency)}` : ''}
                  {cell.data.minOrderAmount == null && cell.data.maxDiscountAmount == null ? '—' : ''}
                </span>
              )}
            />
            <Column
              caption="Period"
              minWidth={180}
              allowSorting={false}
              cellRender={(cell) => <span>{cell.data.startDate.slice(0, 10)} → {cell.data.endDate.slice(0, 10)}</span>}
            />
            <Column
              dataField="isActive"
              caption="Status"
              width={120}
              cellRender={(cell) => (
                <span className={`promo__status ${cell.data.isActive ? 'promo__status--on' : ''}`}>
                  {cell.data.isActive ? 'Active' : 'Inactive'}
                </span>
              )}
            />
            <Column
              dataField="usedCount"
              caption="Used"
              width={130}
              cellRender={(cell) => (
                <span>
                  {cell.data.usedCount}
                  {cell.data.usageLimit != null ? ` / ${cell.data.usageLimit}` : ''}
                  {cell.data.usagePerUser != null ? <span className="promo__muted"> · {cell.data.usagePerUser}/user</span> : null}
                </span>
              )}
            />
            <Column
              caption=""
              width={180}
              allowSorting={false}
              cellRender={(cell) => (
                <span className="promo__actions">
                  <button className="btn btn-outline" onClick={() => onEdit(cell.data)}>Edit</button>
                  <button className="btn btn-outline" onClick={() => onDelete(cell.data)}>Delete</button>
                </span>
              )}
            />
          </DataGrid>
        )}
      </Card>
    </div>
  );
};

export default PromoCodesPage;
