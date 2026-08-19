import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PageHeader from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import { useToast } from "../../components/ui/ToastProvider";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import {
  answerQuestion,
  getModerationSummary,
  hideReview,
  listModerationQuestions,
  listModerationReviews,
  publishReview,
  replyToReview,
  type ModerationQuestion,
  type ModerationReview,
  type QuestionFilter,
  type ReviewFilter,
} from "../../api/adminModerationApi";
import "./moderation-page.css";

/**
 * Модерация: отзывы с жалобами и вопросы без ответа. Две вкладки, потому что это две разные
 * очереди с разным ритмом: жалобы — редко и срочно, вопросы — часто и терпят день.
 */

const PAGE_SIZE = 20;

const ModerationPage: React.FC = () => {
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") === "questions" ? "questions" : "reviews") as "reviews" | "questions";

  const [summary, setSummary] = useState<{ pendingReviews: number; unansweredQuestions: number } | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("pending");
  const [questionFilter, setQuestionFilter] = useState<QuestionFilter>("unanswered");
  const [reviews, setReviews] = useState<ModerationReview[]>([]);
  const [questions, setQuestions] = useState<ModerationQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getModerationSummary());
    } catch {
      /* счётчики в заголовках вкладок — подсказка, не функциональность */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "reviews") {
        const data = await listModerationReviews(reviewFilter, page, PAGE_SIZE);
        setReviews(data.items);
        setTotal(data.total);
      } else {
        const data = await listModerationQuestions(questionFilter, page, PAGE_SIZE);
        setQuestions(data.items);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Moderation load failed", err);
      addToast("Failed to load.", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast, page, questionFilter, reviewFilter, tab]);

  useEffect(() => {
    load();
    loadSummary();
  }, [load, loadSummary]);

  useEffect(() => {
    setPageTitle("Moderation");
    setHeaderActions([{ type: "button", id: "mod-refresh", label: "Refresh", variant: "outline", onClick: () => { load(); loadSummary(); } }]);
    return () => setHeaderActions([]);
  }, [load, loadSummary, setHeaderActions, setPageTitle]);

  const switchTab = (next: "reviews" | "questions") => {
    setPage(1);
    setSearchParams({ tab: next }, { replace: true });
  };

  const run = async (id: string, action: () => Promise<{ ok?: boolean; message?: string }>) => {
    setBusyId(id);
    try {
      const result = await action();
      addToast(result?.message ?? "Done.", result?.ok === false ? "error" : "success");
      await load();
      await loadSummary();
    } catch (err) {
      console.error("Moderation action failed", err);
      addToast("Action failed.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-grid moderation">
      <PageHeader
        title="Moderation"
        description="Reported reviews and unanswered questions from game pages."
        breadcrumbs={["Support", "Moderation"]}
      />

      <div className="moderation__tabs" role="tablist">
        <button role="tab" aria-selected={tab === "reviews"} className={`moderation__tab${tab === "reviews" ? " moderation__tab--active" : ""}`} onClick={() => switchTab("reviews")}>
          Reviews{summary && summary.pendingReviews > 0 && <span className="moderation__badge">{summary.pendingReviews}</span>}
        </button>
        <button role="tab" aria-selected={tab === "questions"} className={`moderation__tab${tab === "questions" ? " moderation__tab--active" : ""}`} onClick={() => switchTab("questions")}>
          Questions{summary && summary.unansweredQuestions > 0 && <span className="moderation__badge">{summary.unansweredQuestions}</span>}
        </button>
      </div>

      {tab === "reviews" ? (
        <Card>
          <div className="moderation__toolbar">
            <select className="input moderation__filter" value={reviewFilter} onChange={(e) => { setPage(1); setReviewFilter(e.target.value as ReviewFilter); }}>
              <option value="pending">Reported (pending)</option>
              <option value="hidden">Hidden</option>
              <option value="published">Published</option>
              <option value="all">All</option>
            </select>
            <span className="moderation__muted">{total} review{total === 1 ? "" : "s"}</span>
          </div>

          {loading && reviews.length === 0 ? (
            <p className="moderation__muted">Loading…</p>
          ) : reviews.length === 0 ? (
            <p className="moderation__muted">{reviewFilter === "pending" ? "No reported reviews — nothing to decide." : "Nothing here."}</p>
          ) : (
            <ul className="moderation__list">
              {reviews.map((r) => (
                <li key={r.id} className={`moderation__item moderation__item--${r.status.toLowerCase()}`}>
                  <div className="moderation__item-head">
                    <div>
                      <Link className="moderation__game" to={`/admin/games/details?game=${encodeURIComponent(r.gameId)}`}>{r.gameTitle}</Link>
                      <span className="moderation__muted"> · {r.userName} · {"★".repeat(r.rating)}{"☆".repeat(Math.max(0, 5 - r.rating))} · {new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="moderation__flags">
                      {r.reportCount > 0 && <span className="moderation__pill moderation__pill--warn">{r.reportCount} report{r.reportCount === 1 ? "" : "s"}</span>}
                      <span className="moderation__pill">{r.status}</span>
                    </div>
                  </div>
                  <p className="moderation__text">{r.text}</p>
                  {r.shopReply && (
                    <p className="moderation__reply">
                      <strong>Shop reply</strong> ({r.shopReply.author}): {r.shopReply.text}
                    </p>
                  )}
                  <div className="moderation__actions">
                    {r.status !== "Published" && (
                      <button className="btn btn-primary" disabled={busyId === r.id} onClick={() => run(r.id, () => publishReview(r.id))}>Publish</button>
                    )}
                    {r.status !== "Hidden" && (
                      <button className="btn btn-outline moderation__danger" disabled={busyId === r.id} onClick={() => run(r.id, () => hideReview(r.id))}>Hide</button>
                    )}
                    <input
                      className="input moderation__reply-input"
                      placeholder={r.shopReply ? "Replace the shop reply…" : "Reply as the shop…"}
                      value={drafts[r.id] ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    />
                    <button
                      className="btn btn-outline"
                      disabled={busyId === r.id || !(drafts[r.id] ?? "").trim()}
                      onClick={() => run(r.id, async () => { const res = await replyToReview(r.id, drafts[r.id]); setDrafts((p) => ({ ...p, [r.id]: "" })); return res; })}
                    >
                      Reply
                    </button>
                    {r.shopReply && (
                      <button className="btn btn-outline" disabled={busyId === r.id} onClick={() => run(r.id, () => replyToReview(r.id, ""))}>Remove reply</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <Card>
          <div className="moderation__toolbar">
            <select className="input moderation__filter" value={questionFilter} onChange={(e) => { setPage(1); setQuestionFilter(e.target.value as QuestionFilter); }}>
              <option value="unanswered">Unanswered</option>
              <option value="all">All</option>
            </select>
            <span className="moderation__muted">{total} question{total === 1 ? "" : "s"}</span>
          </div>

          {loading && questions.length === 0 ? (
            <p className="moderation__muted">Loading…</p>
          ) : questions.length === 0 ? (
            <p className="moderation__muted">{questionFilter === "unanswered" ? "Every question has an answer." : "Nothing here."}</p>
          ) : (
            <ul className="moderation__list">
              {questions.map((q) => (
                <li key={q.id} className="moderation__item">
                  <div className="moderation__item-head">
                    <div>
                      <Link className="moderation__game" to={`/admin/games/details?game=${encodeURIComponent(q.gameId)}`}>{q.gameTitle}</Link>
                      <span className="moderation__muted"> · {q.userName} · {new Date(q.createdAt).toLocaleDateString()}</span>
                    </div>
                    {q.answers.length > 0 && <span className="moderation__pill">{q.answers.length} answer{q.answers.length === 1 ? "" : "s"}</span>}
                  </div>
                  <p className="moderation__text">{q.question}</p>
                  {q.answers.map((a) => (
                    <p key={a.id} className={`moderation__reply${a.isOfficial ? " moderation__reply--official" : ""}`}>
                      <strong>{a.isOfficial ? "Official" : a.userName}</strong>: {a.text}
                    </p>
                  ))}
                  <div className="moderation__actions">
                    <input
                      className="input moderation__reply-input"
                      placeholder="Answer as the shop…"
                      value={drafts[q.id] ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    />
                    <button
                      className="btn btn-primary"
                      disabled={busyId === q.id || !(drafts[q.id] ?? "").trim()}
                      onClick={() => run(q.id, async () => { const res = await answerQuestion(q.id, drafts[q.id]); setDrafts((p) => ({ ...p, [q.id]: "" })); return res; })}
                    >
                      Answer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {pages > 1 && (
        <div className="moderation__pager">
          <button className="btn btn-outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="moderation__muted">Page {page} of {pages}</span>
          <button className="btn btn-outline" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
};

export default ModerationPage;
