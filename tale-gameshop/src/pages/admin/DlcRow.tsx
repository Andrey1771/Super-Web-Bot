import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../components/ui/ToastProvider";
import { apiErrorMessage } from "../../api/adminSoftwareApi";
import { quickEditGameDlc, type AdminDlcRow } from "../../api/adminDlcApi";
import KeyInventorySection from "../../components/admin/KeyInventorySection";
import { formatMoney } from "../../utils/format-money";

/**
 * Строка DLC в списке игры. По клику раскрывается и правится на месте: название, цена, дата выхода, публикация и ключи —
 * то, ради чего в DLC заходят чаще всего. Описание, медиа и требования — в полном редакторе (ссылка внутри).
 * Раньше строка была только ссылкой в редактор, и было неочевидно, где у дополнения его характеристики.
 */
const DlcRow: React.FC<{
  dlc: AdminDlcRow;
  /** Игра, чьё это DLC: правка идёт через неё. */
  parentId: string;
  expanded: boolean;
  onToggle: () => void;
  /** Сохранили или поменяли ключи — список перечитывается. */
  onSaved: () => void;
  /** Открыта карточка этого же DLC: строка подсвечена и помечена «open now», правится как остальные. */
  current?: boolean;
  /** Отвязать от игры — дополнение станет самостоятельной игрой. */
  onDetach: () => Promise<void>;
  /** Удалить товар совсем. */
  onDelete: () => Promise<void>;
}> = ({ dlc, parentId, expanded, onToggle, onSaved, current = false, onDetach, onDelete }) => {
  const { addToast } = useToast();
  const [title, setTitle] = useState(dlc.title);
  const [price, setPrice] = useState(String(dlc.price));
  const [releaseDate, setReleaseDate] = useState(dlc.releaseDate?.slice(0, 10) ?? "");
  const [isDraft, setIsDraft] = useState(dlc.isDraft);
  const [showKeys, setShowKeys] = useState(false);
  const [saving, setSaving] = useState(false);
  // Что подтверждаем: отвязку или удаление — подтверждение прямо в строке, без отдельного окна.
  const [confirm, setConfirm] = useState<null | "detach" | "delete">(null);

  const runConfirmed = async () => {
    const action = confirm === "delete" ? onDelete : onDetach;
    setSaving(true);
    try {
      await action();
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  };

  // Новые данные списка (после сохранения или правки в другом месте) — форма с ними.
  useEffect(() => {
    setTitle(dlc.title);
    setPrice(String(dlc.price));
    setReleaseDate(dlc.releaseDate?.slice(0, 10) ?? "");
    setIsDraft(dlc.isDraft);
  }, [dlc.title, dlc.price, dlc.releaseDate, dlc.isDraft]);

  const priceNumber = Number(price);
  const changed =
    title.trim() !== dlc.title ||
    priceNumber !== dlc.price ||
    releaseDate !== (dlc.releaseDate?.slice(0, 10) ?? "") ||
    isDraft !== dlc.isDraft;
  const valid = title.trim().length > 0 && price.trim() !== "" && Number.isFinite(priceNumber) && priceNumber >= 0;

  const save = async () => {
    setSaving(true);
    try {
      await quickEditGameDlc(parentId, dlc.id, {
        ...(title.trim() !== dlc.title ? { title: title.trim() } : {}),
        ...(priceNumber !== dlc.price ? { price: priceNumber } : {}),
        ...(releaseDate && releaseDate !== dlc.releaseDate?.slice(0, 10) ? { releaseDate } : {}),
        ...(isDraft !== dlc.isDraft ? { isDraft } : {}),
      });
      addToast(`“${title.trim()}” saved.`, "success");
      onSaved();
    } catch (error) {
      addToast(apiErrorMessage(error, "Failed to save the DLC."), "error");
    } finally {
      setSaving(false);
    }
  };


  return (
    <li className={`dlc-manager__row${current ? " is-current" : ""}${expanded ? " is-expanded" : ""}`}>
      <div className="dlc-manager__row-head">
        {dlc.imagePath ? <img className="dlc-manager__cover" src={dlc.imagePath} alt="" loading="lazy" /> : <span className="dlc-manager__cover" />}
        <div
          className="dlc-manager__info is-toggle"
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={onToggle}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggle();
            }
          }}
        >
          <span className="dlc-manager__title">{dlc.title}</span>
          <div className="dlc-manager__meta">
            {current && <span className="dlc-chip is-dlc">open now</span>}
            <span>{formatMoney(dlc.price, dlc.currency)}</span>
            <span className={`dlc-chip ${dlc.isDraft ? "is-draft" : "is-live"}`}>{dlc.isDraft ? "Draft" : "Published"}</span>
            {dlc.isComingSoon && <span className="dlc-chip">Coming soon</span>}
            <span className={`dlc-chip ${dlc.keysAvailable > 0 ? "" : "is-warn"}`}>
              {dlc.keysAvailable > 0 ? `${dlc.keysAvailable} keys` : "No keys"}
            </span>
          </div>
        </div>
        <div className="dlc-manager__row-actions">
          <button type="button" className="btn btn-outline btn-small" aria-expanded={expanded} onClick={onToggle}>
            {expanded ? "Close" : "Edit"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="dlc-edit">
          <div className="dlc-edit__grid">
            <label className="dlc-edit__wide">
              <span className="text-sm font-semibold">Name</span>
              <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              <span className="text-sm font-semibold">Price, {dlc.currency}</span>
              <input className="input" type="number" min={0} step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} />
            </label>
            <label>
              <span className="text-sm font-semibold">Release date</span>
              <input className="input" type="date" value={releaseDate} onChange={(event) => setReleaseDate(event.target.value)} />
            </label>
            <div>
              <span className="text-sm font-semibold">Visibility</span>
              <div className="dlc-edit__segment" role="radiogroup" aria-label="Visibility">
                <button type="button" role="radio" aria-checked={!isDraft} className={!isDraft ? "is-active" : ""} onClick={() => setIsDraft(false)}>
                  Published
                </button>
                <button type="button" role="radio" aria-checked={isDraft} className={isDraft ? "is-active" : ""} onClick={() => setIsDraft(true)}>
                  Draft
                </button>
              </div>
            </div>
          </div>

          <div className="dlc-edit__keys">
            <span>
              <strong>Keys:</strong> {dlc.keysAvailable > 0 ? `${dlc.keysAvailable} in stock` : "none — the DLC can't be bought until keys are added"}
            </span>
            <button
              type="button"
              className="btn btn-outline btn-small"
              onClick={() => {
                if (showKeys) onSaved();
                setShowKeys((value) => !value);
              }}
            >
              {showKeys ? "Hide keys" : "Manage keys"}
            </button>
          </div>
          {showKeys && (
            <div className="dlc-edit__keys-panel">
              <KeyInventorySection gameId={dlc.id} />
            </div>
          )}

          <div className="dlc-edit__actions">
            {confirm ? (
              <>
                <span className="dlc-manager__confirm">
                  {confirm === "delete"
                    ? `Delete “${dlc.title}” for good? The product, its card and price go away; orders keep their history.`
                    : `Detach “${dlc.title}”? It becomes a standalone game and shows in the general catalog if published.`}
                </span>
                <button
                  type="button"
                  className={`btn btn-small ${confirm === "delete" ? "btn-danger" : "btn-outline"}`}
                  disabled={saving}
                  onClick={() => void runConfirmed()}
                >
                  {confirm === "delete" ? "Yes, delete" : "Yes, detach"}
                </button>
                <button type="button" className="btn btn-small" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-primary btn-small" disabled={!changed || !valid || saving} onClick={() => void save()}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button type="button" className="btn btn-small" onClick={onToggle}>
                  Cancel
                </button>
                <span className="dlc-edit__spacer" />
                <button type="button" className="btn btn-outline btn-small" onClick={() => setConfirm("detach")}>
                  Detach from the game
                </button>
                <button type="button" className="btn btn-outline btn-small dlc-edit__delete" onClick={() => setConfirm("delete")}>
                  Delete DLC
                </button>
              </>
            )}
          </div>
          <Link to={`/admin/games/${dlc.id}/edit`} className="dlc-edit__full">
            Full editor — description, cover, screenshots, requirements →
          </Link>
        </div>
      )}
    </li>
  );
};

export default DlcRow;
