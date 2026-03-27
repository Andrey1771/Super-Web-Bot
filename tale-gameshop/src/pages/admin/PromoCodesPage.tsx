import React, { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import { useToast } from '../../components/ui/ToastProvider';
import { useAdminHeader } from '../../components/layout/AdminHeaderContext';
import container from '../../inversify.config';
import IDENTIFIERS from '../../constants/identifiers';
import type { IAdminPromoCodesService } from '../../iterfaces/i-admin-promo-codes-service';
import type { PromoCode, PromoCodePayload, PromoCodeType } from '../../types/promo-codes';

const emptyPayload = (): PromoCodePayload => ({
  code: '', type: 'percentage', value: 10, minOrderAmount: null, maxDiscountAmount: null,
  firstOrderOnly: false, startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10),
  usageLimit: null, usagePerUser: null,
});

const PromoCodesPage: React.FC = () => {
  const service = container.get<IAdminPromoCodesService>(IDENTIFIERS.IAdminPromoCodesService);
  const { addToast } = useToast();
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const [items, setItems] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<PromoCodePayload>(emptyPayload());
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await service.getAll()); } catch { addToast('Failed to load promo codes', 'error'); } finally { setLoading(false); }
  }, [addToast, service]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPageTitle('Promo codes'); setHeaderActions([]); return () => setHeaderActions([]); }, [setHeaderActions, setPageTitle]);

  const onSubmit = async () => {
    try {
      if (editingId) {
        await service.update(editingId, draft);
        addToast('Promo code updated', 'success');
      } else {
        await service.create(draft);
        addToast('Promo code created', 'success');
      }
      setDraft(emptyPayload());
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
      minOrderAmount: item.minOrderAmount ?? null,
      maxDiscountAmount: item.maxDiscountAmount ?? null,
      firstOrderOnly: item.firstOrderOnly,
      startDate: item.startDate.slice(0, 10),
      endDate: item.endDate.slice(0, 10),
      usageLimit: item.usageLimit ?? null,
      usagePerUser: item.usagePerUser ?? null,
    });
  };

  const onDelete = async (id: string) => {
    await service.remove(id);
    addToast('Promo code deleted', 'success');
    await load();
  };

  const setNumber = (field: keyof PromoCodePayload, value: string) => setDraft((prev) => ({ ...prev, [field]: value === '' ? null : Number(value) }));

  return (
    <div className="admin-grid">
      <PageHeader title="Promo codes" description="Manage checkout promo campaigns." breadcrumbs={['Promo codes', 'Admin']} />
      <Card>
        <div className="admin-grid admin-grid--3">
          <input className="input" placeholder="Code" value={draft.code} onChange={(e) => setDraft((prev) => ({ ...prev, code: e.target.value }))} />
          <select className="input" value={draft.type} onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value as PromoCodeType }))}><option value="percentage">Percentage</option><option value="fixed">Fixed</option></select>
          <input className="input" type="number" min={0} placeholder="Value" value={draft.value} onChange={(e) => setDraft((prev) => ({ ...prev, value: Number(e.target.value) }))} />
          <input className="input" type="number" min={0} placeholder="Min order" value={draft.minOrderAmount ?? ''} onChange={(e) => setNumber('minOrderAmount', e.target.value)} />
          <input className="input" type="number" min={0} placeholder="Max discount" value={draft.maxDiscountAmount ?? ''} onChange={(e) => setNumber('maxDiscountAmount', e.target.value)} />
          <label><input type="checkbox" checked={draft.firstOrderOnly} onChange={(e) => setDraft((prev) => ({ ...prev, firstOrderOnly: e.target.checked }))} /> First order only</label>
          <input className="input" type="date" value={draft.startDate} onChange={(e) => setDraft((prev) => ({ ...prev, startDate: e.target.value }))} />
          <input className="input" type="date" value={draft.endDate} onChange={(e) => setDraft((prev) => ({ ...prev, endDate: e.target.value }))} />
          <input className="input" type="number" min={0} placeholder="Usage limit" value={draft.usageLimit ?? ''} onChange={(e) => setNumber('usageLimit', e.target.value)} />
          <input className="input" type="number" min={0} placeholder="Usage per user" value={draft.usagePerUser ?? ''} onChange={(e) => setNumber('usagePerUser', e.target.value)} />
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={onSubmit}>{editingId ? 'Update' : 'Create'}</button>
          {editingId && <button className="btn btn-outline" onClick={() => { setEditingId(null); setDraft(emptyPayload()); }}>Cancel edit</button>}
        </div>
      </Card>
      <Card>
        {loading ? <p>Loading...</p> : (
          <table className="w-full text-sm">
            <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Period</th><th>Status</th><th>Used</th><th /></tr></thead>
            <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.code}</td><td>{item.type}</td><td>{item.value}</td><td>{item.startDate.slice(0,10)} - {item.endDate.slice(0,10)}</td>
                <td>{item.isActive ? 'Active' : 'Inactive'}</td><td>{item.usedCount}{item.remaining != null ? ` (${item.remaining} left)` : ''}</td>
                <td><button className="btn btn-outline" onClick={() => onEdit(item)}>Edit</button> <button className="btn btn-outline" onClick={() => onDelete(item.id)}>Delete</button></td>
              </tr>
            ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default PromoCodesPage;
