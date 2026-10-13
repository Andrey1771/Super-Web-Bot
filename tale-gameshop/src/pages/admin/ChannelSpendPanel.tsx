import React, { useCallback, useEffect, useState } from "react";
import {
  addChannelSpend,
  deleteChannelSpend,
  getChannelSpend,
  type ChannelSpend,
} from "../../api/adminReportsApi";
import { formatMoney } from "../../utils/format-money";

/**
 * Ввод рекламных трат.
 *
 * Взять сумму автоматически неоткуда: рекламные кабинеты живут отдельно, доступа к ним у
 * магазина нет. Поэтому единственный честный способ узнать окупаемость канала — занести
 * трату руками. Одна запись — один день одного источника: этого хватает, чтобы сложить
 * бюджет за любой период, и не заставляет заводить кампании там, где их нет.
 *
 * Источник пишется теми же словами, что и в отчёте выше (google, telegram, reddit): иначе
 * трата не сойдётся ни с одной строкой и повиснет отдельным каналом без продаж.
 */
const ChannelSpendPanel: React.FC<{
  fromUtc: string;
  toUtc: string;
  baseCurrency: string;
  knownSources: string[];
  onChanged: () => void;
}> = ({ fromUtc, toUtc, baseCurrency, knownSources, onChanged }) => {
  const [rows, setRows] = useState<ChannelSpend[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState("");
  const [spentOn, setSpentOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(baseCurrency);
  const [note, setNote] = useState("");

  const reload = useCallback(async () => {
    try {
      setRows(await getChannelSpend(fromUtc, toUtc));
    } catch {
      setRows([]);
    }
  }, [fromUtc, toUtc]);

  useEffect(() => {
    if (open) {
      reload();
    }
  }, [open, reload]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!source.trim()) {
      setError("Pick the source the money went to.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError("The amount must be greater than zero.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await addChannelSpend({
        source: source.trim(),
        spentOn: `${spentOn}T00:00:00Z`,
        amount: value,
        currency: currency.trim() || baseCurrency,
        note: note.trim() || undefined,
      });
      setAmount("");
      setNote("");
      await reload();
      // Отчёт наверху пересчитываем сразу: иначе окупаемость останется прежней и
      // выглядит так, будто трата не записалась.
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to save the spend.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await deleteChannelSpend(id);
      await reload();
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to delete the entry.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-outline btn-small" onClick={() => setOpen(true)}>
        Record ad spend
      </button>
    );
  }

  return (
    <div className="spend-panel">
      <div className="spend-panel__head">
        <strong>Ad spend in this period</strong>
        <button type="button" className="btn btn-outline btn-small" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>

      <form className="spend-form" onSubmit={submit}>
        <label className="spend-form__field">
          <span className="field-label">Source</span>
          <input
            className="input"
            list="channel-spend-sources"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="google"
            disabled={busy}
          />
          {/* Подсказка из источников, которые уже приносили заказы: так написание совпадёт
              с отчётом, и трата встанет в нужную строку, а не заведёт новый канал. */}
          <datalist id="channel-spend-sources">
            {knownSources.map((known) => (
              <option key={known} value={known} />
            ))}
          </datalist>
        </label>
        <label className="spend-form__field">
          <span className="field-label">Date</span>
          <input
            className="input"
            type="date"
            value={spentOn}
            onChange={(event) => setSpentOn(event.target.value)}
            disabled={busy}
          />
        </label>
        <label className="spend-form__field spend-form__field--narrow">
          <span className="field-label">Amount</span>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={busy}
          />
        </label>
        <label className="spend-form__field spend-form__field--narrow">
          <span className="field-label">Currency</span>
          <input
            className="input"
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            maxLength={3}
            disabled={busy}
          />
        </label>
        <label className="spend-form__field">
          <span className="field-label">Note (optional)</span>
          <input
            className="input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Search campaign, week 12"
            disabled={busy}
          />
        </label>
        <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
          Add
        </button>
      </form>

      {error && <p className="editor-pick__hint">{error}</p>}

      {rows.length === 0 ? (
        <p className="editor-pick__hint">
          Nothing recorded for this period — channel payback stays unknown until it is.
        </p>
      ) : (
        <table className="admin-table report-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Date</th>
              <th className="report-table__num">Amount</th>
              <th>Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.source}</td>
                <td>{row.spentOnUtc.slice(0, 10)}</td>
                <td className="report-table__num">{formatMoney(row.amount, row.currency)}</td>
                <td>{row.note ?? "—"}</td>
                <td className="report-table__num">
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    disabled={busy}
                    onClick={() => remove(row.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ChannelSpendPanel;
