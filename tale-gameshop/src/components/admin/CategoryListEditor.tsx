import React, { useEffect, useState } from "react";
import { useToast } from "../ui/ToastProvider";
import { apiErrorMessage } from "../../api/adminSoftwareApi";
import { slugify } from "../../utils/slugify";

/** Строка списка: код-адрес, название и сколько товаров в ней. */
export interface CategoryListItem {
  tag: string;
  title: string;
  /** Названия на языках сайта (ru/uk/pl); английское — title. */
  titles?: Record<string, string> | null;
  count: number;
}

/** Языки сайта, для которых в строке есть поле перевода. Английское название — основное поле. */
const TRANSLATION_LANGS: Array<{ code: string; label: string }> = [
  { code: "ru", label: "RU" },
  { code: "uk", label: "UK" },
  { code: "pl", label: "PL" },
];

type Row = CategoryListItem & { isNew?: boolean; tagEdited?: boolean };

export interface CategoryListEditorProps {
  load: () => Promise<CategoryListItem[]>;
  save: (list: Array<{ tag: string; title: string; titles?: Record<string, string> }>) => Promise<CategoryListItem[]>;
  onSaved?: (list: CategoryListItem[]) => void;
  /** Как называется строка: «Category», «Genre». Из него — подписи полей и кнопок. */
  noun: string;
  /** Как называется весь список: «Software categories», «Game genres». Из него — тексты тостов и кнопки сохранения. */
  listName: string;
  /** Что лежит в строке: «product», «game». */
  itemNoun: string;
  hint: React.ReactNode;
  namePlaceholder: string;
  tagPlaceholder: string;
  max: number;
}

/**
 * Список «название + адрес + порядок» — категории софта и жанры игр. Порядок списка — порядок в фильтрах каталога.
 * Адрес (tag) — часть ссылки и значение у товара, поэтому у строки с товарами он не правится: старые ссылки перестали
 * бы открываться, а товары выпали бы из неё. По той же причине строку с товарами нельзя удалить — сервер тоже не даст.
 */
const CategoryListEditor: React.FC<CategoryListEditorProps> = ({
  load,
  save: saveList,
  onSaved,
  noun,
  listName,
  itemNoun,
  hint,
  namePlaceholder,
  tagPlaceholder,
  max,
}) => {
  const { addToast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const lowerNoun = noun.toLowerCase();

  useEffect(() => {
    load()
      .then(setRows)
      .catch((error) => addToast(apiErrorMessage(error, `Failed to load ${listName.toLowerCase()}.`), "error"))
      .finally(() => setLoading(false));
    // Один раз при открытии: addToast и load не обязаны быть стабильными, а перечитывать список из-за них незачем.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = (next: Row[]) => {
    setRows(next);
    setDirty(true);
  };

  const update = (index: number, patch: Partial<Row>) =>
    change(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    change(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Переводы шлём только заполненные: пустой словарь сервер и так отбросит.
      const saved = await saveList(rows.map((row) => {
        const titles = Object.fromEntries(Object.entries(row.titles ?? {}).filter(([, value]) => value.trim()));
        return Object.keys(titles).length > 0 ? { tag: row.tag, title: row.title, titles } : { tag: row.tag, title: row.title };
      }));
      setRows(saved);
      setDirty(false);
      onSaved?.(saved);
      addToast(`${listName} saved.`, "success");
    } catch (error) {
      addToast(apiErrorMessage(error, `Failed to save ${listName.toLowerCase()}.`), "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div className="software-categories-editor">
      <p className="editor-pick__hint">{hint}</p>
      <div className="software-categories-editor__row software-categories-editor__row--head">
        <span>Name</span>
        <span>Address</span>
        <span>{itemNoun === "game" ? "Games" : "Products"}</span>
        <span />
      </div>
      {rows.map((row, index) => {
        const locked = row.count > 0;
        return (
          <div key={`${index}-${row.isNew ? "new" : row.tag}`} className="software-categories-editor__row">
            <input
              className="input"
              value={row.title}
              placeholder={namePlaceholder}
              aria-label={`${noun} name`}
              onChange={(event) => {
                const title = event.target.value;
                // У новой строки адрес следует за названием, пока его не поправили руками.
                update(index, row.isNew && !row.tagEdited ? { title, tag: slugify(title).replace(/[^a-z0-9-]/g, "") } : { title });
              }}
            />
            <input
              className="input"
              value={row.tag}
              placeholder={tagPlaceholder}
              aria-label={`${noun} address`}
              disabled={locked}
              title={locked ? `Used by ${itemNoun}s — the address can't change` : undefined}
              onChange={(event) => update(index, { tag: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""), tagEdited: true })}
            />
            <span className="software-categories-editor__count">{row.count}</span>
            <span className="software-categories-editor__actions">
              <button type="button" className="btn btn-outline btn-small" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">
                ↑
              </button>
              <button type="button" className="btn btn-outline btn-small" onClick={() => move(index, 1)} disabled={index === rows.length - 1} aria-label="Move down">
                ↓
              </button>
              <button
                type="button"
                className="btn btn-outline btn-small"
                onClick={() => change(rows.filter((_, i) => i !== index))}
                disabled={locked || rows.length <= 1}
                title={locked ? `Move its ${row.count} ${itemNoun}${row.count === 1 ? "" : "s"} to another ${lowerNoun} first` : `Remove ${lowerNoun}`}
                aria-label={`Remove ${lowerNoun}`}
              >
                ×
              </button>
            </span>
            {/* Названия на языках сайта: пустое поле — покупатель увидит английское название.
                Строка на всю ширину под основной: сетка строки рассчитана на четыре колонки. */}
            <span className="software-categories-editor__titles" style={{ gridColumn: "1 / -1", display: "flex", gap: 8, flexWrap: "wrap" }}>
              {TRANSLATION_LANGS.map((lang) => (
                <label key={lang.code} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                  <span>{lang.label}</span>
                  <input
                    className="input"
                    value={row.titles?.[lang.code] ?? ""}
                    placeholder={row.title}
                    aria-label={`${noun} name (${lang.label})`}
                    onChange={(event) => update(index, { titles: { ...(row.titles ?? {}), [lang.code]: event.target.value } })}
                  />
                </label>
              ))}
            </span>
          </div>
        );
      })}
      <div className="software-categories-editor__footer">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => change([...rows, { tag: "", title: "", count: 0, isNew: true }])}
          disabled={rows.length >= max}
        >
          Add {lowerNoun}
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : `Save ${listName.split(" ").pop()!.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
};

export default CategoryListEditor;
