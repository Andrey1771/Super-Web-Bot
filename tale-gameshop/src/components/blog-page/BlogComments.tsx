import React, { useCallback, useEffect, useRef, useState } from "react";
import { useKeycloak } from "@react-keycloak/web";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IBlogService } from "../../iterfaces/i-blog-service";
import type { IAdminBlogService } from "../../iterfaces/i-admin-blog-service";
import type { BlogComment } from "../../types/blog";
import { getAnonId } from "../../hooks/use-blog-tracking";

const PAGE_SIZE = 10;
const MAX_TEXT_LENGTH = 2000;

const formatCommentDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

/**
 * Комментарии под статьёй: лента видна всем, а пишут только залогиненные —
 * подпись берётся из ника профиля на бэкенде, подделать её нельзя.
 * Гостю вместо формы показываем приглашение войти.
 */
export default function BlogComments({ postId }: { postId: string }) {
  const blogService = container.get<IBlogService>(IDENTIFIERS.IBlogService);
  const { keycloak } = useKeycloak();
  const isAuthenticated = Boolean(keycloak.authenticated);
  // Админ может модерировать прямо со страницы статьи, не уходя в админку.
  const tokenRoles = keycloak.tokenParsed as
    | { realm_access?: { roles?: string[] }; resource_access?: Record<string, { roles?: string[] }> }
    | undefined;
  const isAdmin = [
    ...(tokenRoles?.resource_access?.["tale-shop-app"]?.roles ?? []),
    ...(tokenRoles?.realm_access?.roles ?? [])
  ].includes("admin");
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [text, setText] = useState("");
  const pageRef = useRef(1);

  useEffect(() => {
    let cancelled = false;
    pageRef.current = 1;
    setLoading(true);

    (async () => {
      try {
        const response = await blogService.getComments({ postId, page: 1, pageSize: PAGE_SIZE });
        if (!cancelled) {
          setComments(response.items);
          setTotal(response.total);
        }
      } catch (loadError) {
        console.warn("Failed to load comments", loadError);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blogService, postId]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const response = await blogService.getComments({ postId, page: nextPage, pageSize: PAGE_SIZE });
      pageRef.current = nextPage;
      // Дедуп по id: пока листали, сверху могли добавиться новые комментарии,
      // и старые страницы «съехали» — без фильтра появились бы дубли.
      setComments((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...response.items.filter((item) => !seen.has(item.id))];
      });
      setTotal(response.total);
    } catch (loadError) {
      console.warn("Failed to load more comments", loadError);
    } finally {
      setLoadingMore(false);
    }
  }, [blogService, postId]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedText = text.trim();
      if (!trimmedText || submitting) {
        return;
      }

      setSubmitting(true);
      setSubmitError("");
      try {
        const created = await blogService.addComment({
          postId,
          anonId: getAnonId(),
          text: trimmedText
        });
        setComments((prev) => [created, ...prev]);
        setTotal((prev) => prev + 1);
        setText("");
      } catch (submitFailure) {
        console.warn("Failed to add comment", submitFailure);
        // 429 — rate-limit, 403 — бан: в обоих случаях говорим правду,
        // а не безликое «попробуйте ещё раз».
        const status = (submitFailure as { response?: { status?: number } })?.response?.status;
        setSubmitError(
          status === 429
            ? "You're commenting too fast — please wait a few minutes and try again."
            : status === 403
              ? "Commenting is disabled for your account."
              : "Could not post your comment. Please try again."
        );
      } finally {
        setSubmitting(false);
      }
    },
    [blogService, postId, submitting, text]
  );

  const handleAdminDelete = useCallback(
    async (comment: BlogComment) => {
      const confirmed = window.confirm(`Delete this comment by "${comment.authorName}" permanently?`);
      if (!confirmed) {
        return;
      }

      try {
        const adminBlogService = container.get<IAdminBlogService>(IDENTIFIERS.IAdminBlogService);
        await adminBlogService.deleteComment(comment.id);
        setComments((prev) => prev.filter((item) => item.id !== comment.id));
        setTotal((prev) => Math.max(prev - 1, 0));
      } catch (deleteError) {
        console.warn("Failed to delete comment", deleteError);
      }
    },
    []
  );

  const charactersLeft = MAX_TEXT_LENGTH - text.length;

  return (
    <section className="blog-comments surface" aria-label="Comments">
      <h2 className="blog-comments__title">
        Comments
        {total > 0 && <span className="blog-comments__count">{total}</span>}
      </h2>

      {isAuthenticated ? (
        <form className="blog-comments__form" onSubmit={handleSubmit}>
          <textarea
            className="blog-comments__text"
            value={text}
            maxLength={MAX_TEXT_LENGTH}
            rows={4}
            placeholder="Type your comment here"
            aria-label="Comment text"
            onChange={(event) => setText(event.target.value)}
          />
          <div className="blog-comments__form-row">
            <span className="blog-comments__counter">{charactersLeft} characters left</span>
            <button className="btn btn-primary" type="submit" disabled={!text.trim() || submitting}>
              {submitting ? "Posting…" : "Add comment"}
            </button>
          </div>
          {submitError && <p className="blog-comments__error" role="alert">{submitError}</p>}
        </form>
      ) : (
        /* Гостям форма не показывается: комментируют только с аккаунтом,
           подпись — ник из профиля. */
        <div className="blog-comments__login">
          <p className="muted">Log in to join the discussion — comments are posted under your profile name.</p>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => keycloak.login({ redirectUri: window.location.href })}
          >
            Log in to comment
          </button>
        </div>
      )}

      {loading ? (
        <p className="muted blog-comments__state">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="muted blog-comments__state">No comments yet — be the first to share your thoughts.</p>
      ) : (
        <ul className="blog-comments__list">
          {comments.map((comment) => (
            <li key={comment.id} className="blog-comment">
              <span className="blog-comment__avatar" aria-hidden="true">
                {(comment.authorName || "G").charAt(0).toUpperCase()}
              </span>
              <div className="blog-comment__body">
                <div className="blog-comment__meta">
                  <span className="blog-comment__author">{comment.authorName}</span>
                  <span className="blog-comment__date">{formatCommentDate(comment.createdAt)}</span>
                  {isAdmin && (
                    <button
                      className="blog-comment__delete"
                      type="button"
                      title="Delete comment (admin)"
                      onClick={() => handleAdminDelete(comment)}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p className="blog-comment__text">{comment.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && comments.length < total && (
        <button className="btn btn-outline blog-comments__more" type="button" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : `Show more comments (${total - comments.length})`}
        </button>
      )}
    </section>
  );
}
