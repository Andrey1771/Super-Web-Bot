import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ui/ToastProvider";
import { apiErrorMessage } from "../../api/adminSoftwareApi";
import { attachGameDlc, createGameDlc, deleteDlcProduct, detachGameDlc, getGameDlc, type AdminDlcRow, type AdminGameDlc } from "../../api/adminDlcApi";
import GameSwitcher from "./GameSwitcher";
import DlcRow from "./DlcRow";

/**
 * DLC игры в редакторе карточки. DLC — отдельный товар со ссылкой на игру (ParentGameId): здесь видно все дополнения
 * игры, включая черновики, и здесь же их добавляют — новым черновиком или привязкой уже заведённого товара.
 * Основное у дополнения (название, цена, дата, публикация, ключи) правится прямо в строке (DlcRow), остальное — в его
 * полном редакторе, как у любого товара.
 *
 * Если открыт товар, который сам DLC, — вместо списка его игра: у DLC своих дополнений не бывает.
 */
const DlcManager: React.FC<{
  gameId: string;
  gameTitle: string;
  onCountChange?: (count: number) => void;
  /** После создания, привязки или отвязки — например, чтобы список каталога обновил метки DLC. */
  onChanged?: () => void;
  /**
   * Открыто само DLC и его поля сохранили из строки списка: карточке нужно подтянуть их с сервера, иначе её «Save all»
   * записал бы поверх старые значения.
   */
  onCurrentSaved?: () => void;
}> = ({ gameId, gameTitle, onCountChange, onChanged, onCurrentSaved }) => {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<AdminGameDlc | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<null | "create" | "attach">(null);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDetach, setConfirmDetach] = useState<string | null>(null);
  // Открыто само DLC — все дополнения его игры, чтобы видеть «соседей», не уходя в карточку игры.
  const [siblings, setSiblings] = useState<AdminDlcRow[] | null>(null);
  // Раскрытая для правки строка — одна за раз.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleRow = (id: string) => setExpandedId((current) => (current === id ? null : id));
  const afterRowSave = () => {
    void load();
    onChanged?.();
  };
  /**
   * Отвязать или удалить DLC из строки. Если это открытое сейчас DLC (его карточка вокруг этого блока), после действия
   * уходим в карточку игры: оставаться в карточке удалённого товара бессмысленно.
   */
  const rowAction = async (action: () => Promise<void>, dlc: AdminDlcRow, parentId: string, success: string, failure: string) => {
    try {
      await action();
      addToast(success, "success");
      setExpandedId(null);
      onChanged?.();
      if (dlc.id === gameId) {
        navigate(`/admin/games/${parentId}/edit`);
        return;
      }
      await load();
    } catch (error) {
      addToast(apiErrorMessage(error, failure), "error");
    }
  };
  const rowHandlers = (dlc: AdminDlcRow, parentId: string) => ({
    onDetach: () =>
      rowAction(() => detachGameDlc(parentId, dlc.id), dlc, parentId, `“${dlc.title}” is a standalone game now.`, "Failed to detach."),
    onDelete: () => rowAction(() => deleteDlcProduct(dlc.id), dlc, parentId, `“${dlc.title}” deleted.`, "Failed to delete."),
  });

  const load = useCallback(async () => {
    try {
      const next = await getGameDlc(gameId);
      setData(next);
      setFailed(false);
      onCountChange?.(next.items.length);
      setSiblings(next.parent ? (await getGameDlc(next.parent.id).catch(() => null))?.items ?? null : null);
    } catch {
      setFailed(true);
    }
    // onCountChange — колбэк родителя, новый на каждый рендер: список перечитываем только при смене игры.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    setData(null);
    setMode(null);
    setConfirmDetach(null);
    setExpandedId(null);
    void load();
  }, [load]);

  const run = async (action: () => Promise<void>, success: string, failure: string) => {
    setBusy(true);
    try {
      await action();
      addToast(success, "success");
      setMode(null);
      setConfirmDetach(null);
      await load();
      onChanged?.();
    } catch (error) {
      addToast(apiErrorMessage(error, failure), "error");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const name = newName.trim();
    const price = Number(newPrice || 0);
    if (!name) {
      addToast("Enter the add-on name.", "error");
      return;
    }
    setBusy(true);
    try {
      const created = await createGameDlc(gameId, name, Number.isFinite(price) ? price : 0);
      setNewName("");
      setNewPrice("");
      setMode(null);
      addToast(`“${name}” created as a draft DLC — add a description, cover and keys, then publish it.`, "success", {
        action: { label: "Open editor", onClick: () => navigate(`/admin/games/${created.id}/edit`) },
      });
      await load();
      onChanged?.();
    } catch (error) {
      addToast(apiErrorMessage(error, "Failed to create the DLC."), "error");
    } finally {
      setBusy(false);
    }
  };

  if (failed) {
    return (
      <div className="dlc-manager__note">
        Couldn't load the DLC list.{" "}
        <button type="button" className="btn btn-outline btn-small" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }
  if (!data) {
    return <div className="dlc-manager__note">Loading DLC…</div>;
  }
  if (data.kind === "Software") {
    return <div className="dlc-manager__note">Software has no DLC.</div>;
  }

  // Открыто само дополнение: показываем его игру.
  if (data.parent) {
    return (
      <div className="dlc-manager">
        <div className="dlc-manager__parent">
          <span className="dlc-chip is-dlc">DLC</span>
          <span>
            This product is a DLC of{" "}
            <Link to={`/admin/games/${data.parent.id}/edit`}>{data.parent.title}</Link>. It is listed on that game's page and
            hidden from the general catalog. A DLC can't have DLC of its own.
          </span>
        </div>
        <div className="dlc-manager__actions">
          {confirmDetach === gameId ? (
            <>
              <span className="dlc-manager__confirm">Make it a standalone game?</span>
              <button
                type="button"
                className="btn btn-outline btn-small"
                disabled={busy}
                onClick={() =>
                  void run(() => detachGameDlc(data.parent!.id, gameId), "Detached — it's a standalone game now.", "Failed to detach.")
                }
              >
                Detach
              </button>
              <button type="button" className="btn btn-small" onClick={() => setConfirmDetach(null)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-outline btn-small" onClick={() => setConfirmDetach(gameId)}>
              Detach from the game
            </button>
          )}
        </div>
        {siblings && siblings.length > 0 && (
          <>
            <h4 className="dlc-manager__subtitle">
              All DLC of {data.parent.title} ({siblings.length})
            </h4>
            <ul className="dlc-manager__list">
              {siblings.map((dlc) => (
                <DlcRow
                  key={dlc.id}
                  dlc={dlc}
                  parentId={data.parent!.id}
                  current={dlc.id === gameId}
                  {...rowHandlers(dlc, data.parent!.id)}
                  expanded={expandedId === dlc.id}
                  onToggle={() => toggleRow(dlc.id)}
                  onSaved={() => {
                    afterRowSave();
                    if (dlc.id === gameId) onCurrentSaved?.();
                  }}
                />
              ))}
            </ul>
            <p className="dlc-manager__hint">
              Click a DLC to edit its name, price, date, visibility and keys, detach or delete it right here. Add, attach or detach DLC in the{" "}
              <Link to={`/admin/games/${data.parent.id}/edit`}>{data.parent.title}</Link> card (DLC step).
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="dlc-manager">
      {data.items.length === 0 ? (
        <p className="dlc-manager__note">
          No DLC yet. Each DLC is a separate product: it's listed on this game's page and hidden from the general catalog.
        </p>
      ) : (
        <ul className="dlc-manager__list">
          {data.items.map((dlc) => (
            <DlcRow
              key={dlc.id}
              dlc={dlc}
              parentId={gameId}
              expanded={expandedId === dlc.id}
              onToggle={() => toggleRow(dlc.id)}
              onSaved={afterRowSave}
              {...rowHandlers(dlc, gameId)}
            />
          ))}
        </ul>
      )}

      {mode === "create" && (
        <div className="dlc-manager__form">
          <label>
            <span className="text-sm font-semibold">Name</span>
            <input
              className="input"
              value={newName}
              placeholder={`${gameTitle}: Season Pass`}
              onChange={(event) => setNewName(event.target.value)}
              autoFocus
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Price</span>
            <input className="input" type="number" min={0} step="0.01" value={newPrice} placeholder="9.99" onChange={(event) => setNewPrice(event.target.value)} />
          </label>
          <div className="dlc-manager__form-actions">
            <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => void create()}>
              Create draft DLC
            </button>
            <button type="button" className="btn btn-small" onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
          <p className="dlc-manager__hint">Created as a draft with this game's genre. Fill in the description, cover and keys in its editor, then publish.</p>
        </div>
      )}

      {mode === "attach" && (
        <div className="dlc-manager__form">
          <label className="text-sm font-semibold" htmlFor="dlc-attach-search">Find a product to attach</label>
          <GameSwitcher
            currentTitle=""
            inputId="dlc-attach-search"
            placeholder="Search the catalog…"
            params={{ kind: "game", includeDlc: "true" }}
            exclude={(hit) => hit.id === gameId || hit.parentGameId === gameId || (hit.dlcCount ?? 0) > 0}
            describe={(hit) => (hit.parentGameId ? "DLC of another game — moves here" : hit.slug)}
            onPick={(id, title) =>
              void run(() => attachGameDlc(gameId, id), `“${title}” is a DLC of this game now.`, "Failed to attach.")
            }
          />
          <div className="dlc-manager__form-actions">
            <button type="button" className="btn btn-small" onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
          <p className="dlc-manager__hint">Games that have DLC of their own can't become a DLC and are not listed.</p>
        </div>
      )}

      {mode === null && (
        <div className="dlc-manager__actions">
          <button type="button" className="btn btn-primary btn-small" onClick={() => setMode("create")}>
            + New DLC
          </button>
          <button type="button" className="btn btn-outline btn-small" onClick={() => setMode("attach")}>
            Attach existing
          </button>
        </div>
      )}
    </div>
  );
};

export default DlcManager;
