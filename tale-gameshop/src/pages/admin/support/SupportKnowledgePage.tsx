import React, { useCallback, useEffect, useState } from "react";
import Card from "../../../components/ui/Card";
import { useAdminHeader } from "../../../components/layout/AdminHeaderContext";
import {
  createKnowledgeArticle,
  deleteKnowledgeArticle,
  listKnowledgeArticles,
  updateKnowledgeArticle,
} from "../../../api/supportKnowledgeApi";
import type { SupportKnowledgeArticle } from "../../../types/support-knowledge";
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
});

// Слова редактируются строками через запятую: так группу видно целиком, без вложенных форм.
const parseTerms = (value: string) =>
  value.split(",").map((term) => term.trim()).filter((term) => term.length > 0);

const SupportKnowledgePage: React.FC = () => {
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const [articles, setArticles] = useState<SupportKnowledgeArticle[]>([]);
  const [draft, setDraft] = useState<SupportKnowledgeArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setArticles(await listKnowledgeArticles());
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить темы.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPageTitle("Support / Knowledge");
    setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

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
      setError(detail || "Не удалось сохранить тему.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (article: SupportKnowledgeArticle) => {
    if (!article.id || !window.confirm(`Удалить тему «${article.title}»?`)) {
      return;
    }
    try {
      await deleteKnowledgeArticle(article.id);
      await load();
    } catch (err) {
      console.error(err);
      setError("Не удалось удалить тему.");
    }
  };

  return (
    <div className="knowledge">
      <Card>
        <div className="knowledge__intro">
          <p>
            Этими темами чат отвечает сам и по ним же подсказывает модели. Правки применяются
            без выкладки — новая тема начинает работать в течение пары минут.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setDraft(emptyArticle())}>
            Новая тема
          </button>
        </div>
        {error && <div className="knowledge__error">{error}</div>}
      </Card>

      {draft && (
        <Card>
          <div className="knowledge__form">
            <div className="knowledge__section-title">{draft.id ? "Правка темы" : "Новая тема"}</div>

            <label className="knowledge__field">
              <span>Название</span>
              <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
            </label>

            <div className="knowledge__row">
              <label className="knowledge__field">
                <span>Ключ (slug)</span>
                <input
                  value={draft.slug ?? ""}
                  placeholder="создастся из названия"
                  onChange={(e) => patch({ slug: e.target.value })}
                />
              </label>
              <label className="knowledge__field">
                <span>Категория</span>
                <input value={draft.category ?? ""} onChange={(e) => patch({ category: e.target.value })} />
              </label>
              <label className="knowledge__field knowledge__field--narrow">
                <span>Порядок</span>
                <input
                  type="number"
                  value={draft.sortOrder}
                  onChange={(e) => patch({ sortOrder: Number(e.target.value) || 0 })}
                />
              </label>
            </div>

            <label className="knowledge__field">
              <span>Слова для поиска (через запятую)</span>
              <input
                value={(draft.keywords ?? []).join(", ")}
                onChange={(e) => patch({ keywords: parseTerms(e.target.value) })}
              />
            </label>

            <label className="knowledge__field">
              <span>Материал для модели (английский — модель пересказывает его на языке клиента)</span>
              <textarea rows={7} value={draft.content} onChange={(e) => patch({ content: e.target.value })} />
            </label>

            <label className="knowledge__check">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => patch({ enabled: e.target.checked })}
              />
              <span>Тема включена</span>
            </label>

            <div className="knowledge__divider" />

            <label className="knowledge__check">
              <input
                type="checkbox"
                checked={draft.instantEnabled}
                onChange={(e) => patch({ instantEnabled: e.target.checked })}
              />
              <span>Отвечать готовым текстом, не обращаясь к модели</span>
            </label>

            {draft.instantEnabled && (
              <>
                <p className="knowledge__hint">
                  Тема опознаётся, когда сработала хотя бы одна альтернатива в каждой группе.
                  Одного «ключ» мало — нужна вторая группа с признаком вопроса: «где», «не пришёл».
                  Слово ищется по началу: «оплат» покрывает «оплата» и «оплатить».
                </p>
                {(draft.instantTriggers ?? []).map((group, index) => (
                  <label className="knowledge__field" key={index}>
                    <span>Группа {index + 1}</span>
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
                        Убрать
                      </button>
                    </div>
                  </label>
                ))}
                <button
                  type="button"
                  className="btn btn-outline knowledge__add-group"
                  onClick={() => patch({ instantTriggers: [...(draft.instantTriggers ?? []), []] })}
                >
                  Добавить группу слов
                </button>

                <label className="knowledge__field">
                  <span>Готовый ответ, русский</span>
                  <textarea
                    rows={6}
                    value={draft.instantTextRu ?? ""}
                    onChange={(e) => patch({ instantTextRu: e.target.value })}
                  />
                </label>
                <label className="knowledge__field">
                  <span>Готовый ответ, английский</span>
                  <textarea
                    rows={6}
                    value={draft.instantTextEn ?? ""}
                    onChange={(e) => patch({ instantTextEn: e.target.value })}
                  />
                </label>
              </>
            )}

            <div className="knowledge__actions">
              <button type="button" className="btn btn-outline" onClick={() => setDraft(null)} disabled={saving}>
                Отмена
              </button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? "Сохраняем…" : "Сохранить"}
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="knowledge__section-title">Темы ({articles.length})</div>
        {loading && <div className="knowledge__empty">Загружаем…</div>}
        {!loading && articles.length === 0 && (
          <div className="knowledge__empty">Тем пока нет — добавьте первую.</div>
        )}
        <ul className="knowledge__list">
          {articles.map((article) => (
            <li key={article.id} className="knowledge__item">
              <div className="knowledge__item-main">
                <div className="knowledge__item-title">
                  {article.title}
                  {!article.enabled && <span className="knowledge__badge">выключена</span>}
                  {article.instantEnabled && (
                    <span className="knowledge__badge knowledge__badge--instant">готовый ответ</span>
                  )}
                </div>
                <div className="knowledge__item-meta">
                  {article.category || "без категории"} · {(article.keywords ?? []).length} слов поиска
                  {article.updatedBy ? ` · правил ${article.updatedBy}` : ""}
                </div>
              </div>
              <div className="knowledge__item-actions">
                <button type="button" className="btn btn-outline" onClick={() => setDraft(article)}>
                  Открыть
                </button>
                <button type="button" className="btn btn-outline" onClick={() => remove(article)}>
                  Удалить
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
