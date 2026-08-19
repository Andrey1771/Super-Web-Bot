import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader, { GAMES_TABS } from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
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
  const { setHeaderActions, setPageTitle } = useAdminHeader();
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
    setHeaderActions([]);
    return () => setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

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
      <PageHeader title="Promo codes" description="Checkout promo campaigns. Amounts are per currency." breadcrumbs={['Games', 'Promo codes']} tabs={GAMES_TABS} />

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
        {loading ? <p>Loading...</p> : visible.length === 0 ? <p className="promo__muted">No promo codes.</p> : (
          <div className="promo__table-wrap">
            <table className="admin-table promo__table">
              <thead><tr><th>Code</th><th>Discount</th><th>Currency</th><th>Limits</th><th>Period</th><th>Status</th><th>Used</th><th /></tr></thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id} className={item.isActive ? '' : 'promo__inactive'}>
                    <td><strong>{item.code}</strong>{item.firstOrderOnly && <span className="promo__pill">1st order</span>}</td>
                    <td>{describeValue(item)}</td>
                    <td>{item.currency ?? <span className="promo__muted">any</span>}</td>
                    <td className="promo__muted">
                      {item.minOrderAmount != null ? `min ${formatMoney(item.minOrderAmount, item.currency ?? baseCurrency)}` : ''}
                      {item.minOrderAmount != null && item.maxDiscountAmount != null ? ' · ' : ''}
                      {item.maxDiscountAmount != null ? `cap ${formatMoney(item.maxDiscountAmount, item.currency ?? baseCurrency)}` : ''}
                      {item.minOrderAmount == null && item.maxDiscountAmount == null ? '—' : ''}
                    </td>
                    <td>{item.startDate.slice(0, 10)} → {item.endDate.slice(0, 10)}</td>
                    <td><span className={`promo__status ${item.isActive ? 'promo__status--on' : ''}`}>{item.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>{item.usedCount}{item.usageLimit != null ? ` / ${item.usageLimit}` : ''}{item.usagePerUser != null ? <span className="promo__muted"> · {item.usagePerUser}/user</span> : null}</td>
                    <td className="promo__actions">
                      <button className="btn btn-outline" onClick={() => onEdit(item)}>Edit</button>
                      <button className="btn btn-outline" onClick={() => onDelete(item)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default PromoCodesPage;
