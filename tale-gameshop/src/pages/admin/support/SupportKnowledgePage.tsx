import React, { useCallback, useEffect, useRef, useState } from "react";
import Card from "../../../components/ui/Card";
import { useAdminHeader } from "../../../components/layout/AdminHeaderContext";
import {
  createKnowledgeArticle,
  deleteKnowledgeArticle,
  listKnowledgeArticles,
  updateKnowledgeArticle,
} from "../../../api/supportKnowledgeApi";
import type { SupportKnowledgeArticle } from "../../../types/support-knowledge";
import LocalizedField from "../../../components/admin/LocalizedField";
import "./support-knowledge.css";

const emptyArticle = (): SupportKnowledgeArticle => ({
  title: "",
  slug: "",
  category: "",
  keywords: [],
  content: "",
  enabled: true,
  sortOrder: 0,
  instantEnabled: false,
  instantTriggers: [],
  instantTextRu: "",
  instantTextEn: "",
  instantTextUk: "",
  instantTextPl: "",
});

// Слова редактируются строками через запятую: так группу видно целиком, без вложенных форм.
const parseTerms = (value: string) =>
  value.split(",").map((term) => term.trim()).filter((term) => term.length > 0);

const SupportKnowledgePage: React.FC = () => {
  const { setPageTitle } = useAdminHeader();
  const [articles, setArticles] = useState<SupportKnowledgeArticle[]>([]);
  const [draft, setDraft] = useState<SupportKnowledgeArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Форма редактирования стоит выше списка. Открывая тему из списка, человек оставался
  // смотреть на список — форма менялась за экраном, и казалось, что «Open» ничего не делает.
  const formRef = useRef<HTMLDivElement>(null);

  const openArticle = (article: SupportKnowledgeArticle | null) => {
    setDraft(article);
    // Прокрутка после отрисовки: до неё формы в разметке ещё нет.
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setArticles(await listKnowledgeArticles());
    } catch (err) {
      console.error(err);
      setError("Could not load the topics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPageTitle("Support / Knowledge");
  }, [setPageTitle]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (changes: Partial<SupportKnowledgeArticle>) =>
    setDraft((prev) => (prev ? { ...prev, ...changes } : prev));

  const save = async () => {
    if (!draft) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (draft.id) {
        await updateKnowledgeArticle(draft.id, draft);
      } else {
        await createKnowledgeArticle(draft);
      }
      setDraft(null);
      await load();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "Could not save the topic.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (article: SupportKnowledgeArticle) => {
    if (!article.id || !window.confirm(`Delete the topic “${article.title}”?`)) {
      return;
    }
    try {
      await deleteKnowledgeArticle(article.id);
      await load();
    } catch (err) {
      console.error(err);
      setError("Could not delete the topic.");
    }
  };

  return (
    <div className="knowledge">
      <Card>
        <div className="knowledge__intro">
          <p>
            The chat answers from these topics on its own and uses them to prompt the model. Changes apply
            without a deploy — a new topic starts working within a couple of minutes.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => openArticle(emptyArticle())}>
            New topic
          </button>
        </div>
        {error && <div className="knowledge__error">{error}</div>}
      </Card>

      {draft && (
        <div ref={formRef}>
          <Card>
            <div className="knowledge__form">
              {/* Название открытой темы прямо в заголовке формы: иначе, пролистав вверх,
                  непонятно, что именно правишь — тем восемь, а форма одна. */}
              <div className="knowledge__section-title">
                {draft.id ? `Edit topic — ${draft.title || "untitled"}` : "New topic"}
              </div>

              <label className="knowledge__field">
                <span>Title</span>
                <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
              </label>

              <div className="knowledge__row">
                <label className="knowledge__field">
                  <span>Key (slug)</span>
                  <input
                    value={draft.slug ?? ""}
                    placeholder="generated from the title"
                    onChange={(e) => patch({ slug: e.target.value })}
                  />
                </label>
                <label className="knowledge__field">
                  <span>Category</span>
                  <input value={draft.category ?? ""} onChange={(e) => patch({ category: e.target.value })} />
                </label>
                <label className="knowledge__field knowledge__field--narrow">
                  <span>Order</span>
                  <input
                    type="number"
                    value={draft.sortOrder}
                    onChange={(e) => patch({ sortOrder: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>

              <label className="knowledge__field">
                <span>Search words (comma-separated)</span>
                <input
                  value={(draft.keywords ?? []).join(", ")}
                  onChange={(e) => patch({ keywords: parseTerms(e.target.value) })}
                />
              </label>

              <label className="knowledge__field">
                <span>Source for the model (English — it retells this in the customer’s language)</span>
                <textarea rows={7} value={draft.content} onChange={(e) => patch({ content: e.target.value })} />
              </label>

              <label className="knowledge__check">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => patch({ enabled: e.target.checked })}
                />
                <span>Topic enabled</span>
              </label>

              <div className="knowledge__divider" />

              <label className="knowledge__check">
                <input
                  type="checkbox"
                  checked={draft.instantEnabled}
                  onChange={(e) => patch({ instantEnabled: e.target.checked })}
                />
                <span>Answer with canned text, without calling the model</span>
              </label>

              {draft.instantEnabled && (
                <>
                  <p className="knowledge__hint">
                    A topic matches when at least one alternative in every group fires.
                    “key” alone is not enough — add a second group with a question marker: “where”, “missing”.
                    Matching is by prefix: “pay” covers “payment” and “paid”.
                  </p>
                  {(draft.instantTriggers ?? []).map((group, index) => (
                    <label className="knowledge__field" key={index}>
                      <span>Group {index + 1}</span>
                      <div className="knowledge__row knowledge__row--tight">
                        <input
                          value={group.join(", ")}
                          onChange={(e) => {
                            const next = [...(draft.instantTriggers ?? [])];
                            next[index] = parseTerms(e.target.value);
                            patch({ instantTriggers: next });
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() =>
                            patch({ instantTriggers: (draft.instantTriggers ?? []).filter((_, i) => i !== index) })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </label>
                  ))}
                  <button
                    type="button"
                    className="btn btn-outline knowledge__add-group"
                    onClick={() => patch({ instantTriggers: [...(draft.instantTriggers ?? []), []] })}
                  >
                    Add a word group
                  </button>

                  {/* Четыре текста одной темы под вкладками языков: чат отвечает на языке диалога,
                      а без текста на этом языке тему пропускает и зовёт модель. */}
                  <div className="knowledge__field">
                    <span>Canned answer</span>
                    <LocalizedField
                      label="Canned answer"
                      multiline
                      rows={6}
                      i18n={{ ru: draft.instantTextRu ?? "", uk: draft.instantTextUk ?? "", pl: draft.instantTextPl ?? "" }}
                      onI18nChange={(next) => patch({ instantTextRu: next.ru ?? "", instantTextUk: next.uk ?? "", instantTextPl: next.pl ?? "" })}
                      placeholder="No canned answer in this language — the model answers instead"
                    >
                      <textarea
                        rows={6}
                        value={draft.instantTextEn ?? ""}
                        onChange={(e) => patch({ instantTextEn: e.target.value })}
                      />
                    </LocalizedField>
                  </div>
                </>
              )}

              <div className="knowledge__actions">
                <button type="button" className="btn btn-outline" onClick={() => setDraft(null)} disabled={saving}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <div className="knowledge__section-title">Topics ({articles.length})</div>
        {loading && <div className="knowledge__empty">Loading…</div>}
        {!loading && articles.length === 0 && (
          <div className="knowledge__empty">No topics yet — add the first one.</div>
        )}
        <ul className="knowledge__list">
          {articles.map((article) => (
            <li
              key={article.id}
              className={`knowledge__item${draft?.id === article.id ? " knowledge__item--active" : ""}`}
            >
              <div className="knowledge__item-main">
                <div className="knowledge__item-title">
                  {article.title}
                  {!article.enabled && <span className="knowledge__badge">disabled</span>}
                  {article.instantEnabled && (
                    <span className="knowledge__badge knowledge__badge--instant">canned answer</span>
                  )}
                </div>
                <div className="knowledge__item-meta">
                  {article.category || "no category"} · {(article.keywords ?? []).length} search words
                  {article.updatedBy ? ` · edited by ${article.updatedBy}` : ""}
                </div>
              </div>
              <div className="knowledge__item-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => openArticle(article)}
                >
                  {draft?.id === article.id ? "Editing…" : "Open"}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => remove(article)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};

export default SupportKnowledgePage;
