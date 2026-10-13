import React, { useCallback, useEffect, useState } from "react";
import { backfillKeyCost, getKeyCostGroups, type KeyCostGroup } from "../../api/adminKeysApi";
import { useSitePreferences } from "../../context/site-preferences";

/**
 * Проставление закупочных цен задним числом.
 *
 * У ключей, залитых до появления учёта, цены нет — и пока её нет, склад и маржа занижены.
 * Единственный след партии у таких ключей — день заведения записи, по нему они здесь и
 * сгруппированы: «40 ключей Stardew Valley, залиты 28 июля» — это ровно то, чем закупка была.
 *
 * Уже заполненные цены не переписываются никогда: задача — восстановить недостающее, а не
 * переписать историю. Поэтому применённая группа просто исчезает из списка.
 *
 * Поле «first N keys» решает случай «часть партии куплена дороже»: применяем дважды с разными
 * ценами. Цена хранится на каждом ключе отдельно, так что смешанные закупки — обычное дело,
 * а не исключение.
 */

const KeyCostBackfill: React.FC<{ onApplied?: () => void }> = ({ onApplied }) => {
  const { baseCurrency } = useSitePreferences();
  const [groups, setGroups] = useState<KeyCostGroup[]>([]);
  const [totalKeys, setTotalKeys] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { cost: string; currency: string; supplier: string; limit: string }>>({});

  const rowKey = (group: KeyCostGroup) => `${group.gameId}|${group.uploadedOn}|${group.keyType}|${group.editionCode ?? ""}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getKeyCostGroups();
      setGroups(data.groups);
      setTotalKeys(data.totalKeys);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const valueOf = (group: KeyCostGroup) =>
    draft[rowKey(group)] ?? { cost: "", currency: "", supplier: "", limit: "" };

  const setValue = (group: KeyCostGroup, patch: Partial<{ cost: string; currency: string; supplier: string; limit: string }>) =>
    setDraft((prev) => ({ ...prev, [rowKey(group)]: { ...valueOf(group), ...patch } }));

  const apply = async (group: KeyCostGroup, dryRun: boolean) => {
    const form = valueOf(group);
    const unitCost = Number(form.cost);
    if (!form.cost.trim() || Number.isNaN(unitCost)) {
      setMessage("Enter the purchase price first.");
      return;
    }
    setBusyKey(rowKey(group));
    setMessage(null);
    try {
      const result = await backfillKeyCost({
        gameId: group.gameId,
        uploadedOn: group.uploadedOn,
        keyType: group.keyType,
        editionCode: group.editionCode,
        batchId: group.batchId,
        unitCost,
        costCurrency: form.currency.trim().toUpperCase() || undefined,
        supplier: form.supplier.trim() || undefined,
        limit: form.limit.trim() ? Number(form.limit) : undefined,
        dryRun,
      });
      if (dryRun) {
        setMessage(`${result.matched} key(s) would get ${result.unitCost} ${result.currency}.`);
      } else {
        setMessage(`${result.updated} key(s) priced at ${result.unitCost} ${result.currency}.`);
        await load();
        onApplied?.();
      }
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? "Failed to apply the price.");
    } finally {
      setBusyKey(null);
    }
  };

  if (!loading && groups.length === 0) {
    return <p className="editor-pick__hint">Every key has a purchase price. Nothing to fill in.</p>;
  }

  return (
    <div className="admin-grid">
      <p className="editor-pick__hint">
        {totalKeys} key(s) in {groups.length} batch(es) have no purchase price. Prices already recorded are never
        overwritten — a batch disappears from this list once it is priced. To split a batch across two prices, set
        “first N keys”, apply, then apply again to the rest.
      </p>

      {message && <div className="admin-card"><div className="admin-card__body">{message}</div></div>}

      <div style={{ overflowX: "auto" }}>
        <table className="admin-table report-table">
          <thead>
            <tr>
              <th>Batch</th>
              <th className="report-table__num">Keys</th>
              <th>Price</th>
              <th>Currency</th>
              <th>Supplier</th>
              <th>First N</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const key = rowKey(group);
              const form = valueOf(group);
              const busy = busyKey === key;
              return (
                <tr key={key}>
                  <td>
                    <div>{group.title ?? group.gameId}</div>
                    <span className="report-table__gone">
                      uploaded {group.uploadedOn.slice(0, 10)} · {group.keyType}
                      {group.editionCode ? ` · ${group.editionCode}` : ""}
                      {!group.inCatalog ? " · removed from catalog" : ""}
                    </span>
                  </td>
                  <td className="report-table__num">
                    {group.keys}
                    {/* Выданные и изъятые тоже нуждаются в цене: первые дают себестоимость
                        проданного, вторые — сумму списания. */}
                    {(group.delivered > 0 || group.voided > 0) && (
                      <div className="report-table__gone">
                        {group.inPool} pool
                        {group.delivered > 0 ? ` · ${group.delivered} sold` : ""}
                        {group.voided > 0 ? ` · ${group.voided} void` : ""}
                      </div>
                    )}
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.01"
                      style={{ width: 110 }}
                      value={form.cost}
                      onChange={(event) => setValue(group, { cost: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      style={{ width: 80 }}
                      placeholder={baseCurrency}
                      value={form.currency}
                      onChange={(event) => setValue(group, { currency: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      style={{ width: 150 }}
                      value={form.supplier}
                      onChange={(event) => setValue(group, { supplier: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      style={{ width: 90 }}
                      placeholder={String(group.keys)}
                      value={form.limit}
                      onChange={(event) => setValue(group, { limit: event.target.value })}
                    />
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="btn btn-outline btn-small" disabled={busy} onClick={() => apply(group, true)}>
                      Check
                    </button>{" "}
                    <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => apply(group, false)}>
                      Apply
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default KeyCostBackfill;
