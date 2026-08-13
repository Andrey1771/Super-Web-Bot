import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../../components/layout/PageHeader";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { useToast } from "../../../components/ui/ToastProvider";
import { useAdminHeader } from "../../../components/layout/AdminHeaderContext";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { AdminBlogComment, AdminBlogCommentStatus, IAdminBlogService } from "../../../iterfaces/i-admin-blog-service";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

const formatDate = (value: string) => new Date(value).toLocaleString();

/**
 * Модерация комментариев блога: общий список по всем постам (включая скрытые),
 * скрытие/возврат и безвозвратное удаление.
 */
const BlogCommentsPage: React.FC = () => {
  const adminBlogService = container.get<IAdminBlogService>(IDENTIFIERS.IAdminBlogService);
  const { addToast } = useToast();
  const { setHeaderActions, setPageTitle } = useAdminHeader();

  const [items, setItems] = useState<AdminBlogComment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<AdminBlogCommentStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string>("");

  const fetchComments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminBlogService.getComments({ page, pageSize, status });
      setItems(response.items);
      setTotal(response.total);
    } catch (fetchError) {
      console.error("Failed to load comments", fetchError);
      setError("Unable to load comments.");
    } finally {
      setLoading(false);
    }
  }, [adminBlogService, page, pageSize, status]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    setPageTitle("Blog comments");
    setHeaderActions([]);
    return () => setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

  const handleToggleStatus = async (comment: AdminBlogComment) => {
    const nextStatus: AdminBlogCommentStatus = comment.status === "Hidden" ? "Visible" : "Hidden";
    try {
      setBusyId(comment.id);
      await adminBlogService.setCommentStatus(comment.id, nextStatus);
      setItems((prev) => prev.map((item) => (item.id === comment.id ? { ...item, status: nextStatus } : item)));
      addToast(nextStatus === "Hidden" ? "Comment hidden from the site." : "Comment is visible again.", "success");
    } catch {
      addToast("Failed to update comment status.", "error");
    } finally {
      setBusyId("");
    }
  };

  const handleToggleBan = async (comment: AdminBlogComment) => {
    if (comment.isGuest) {
      addToast("Guest comments have no account to ban.", "error");
      return;
    }

    try {
      setBusyId(comment.id);
      if (comment.authorBanned) {
        await adminBlogService.unbanCommentAuthor(comment.id);
        addToast("Author unbanned — they can comment again.", "success");
      } else {
        await adminBlogService.banCommentAuthor(comment.id);
        addToast("Author banned from commenting.", "success");
      }
      // Бан общий на автора: обновляем флаг у всех его строк, а знаем автора
      // только по совпадению имени и признака аккаунта — надёжнее перечитать список.
      await fetchComments();
    } catch {
      addToast("Failed to update the ban.", "error");
    } finally {
      setBusyId("");
    }
  };

  const handleDelete = async (comment: AdminBlogComment) => {
    // Удаление безвозвратное — прячем за подтверждением.
    const confirmed = window.confirm(`Delete this comment by "${comment.authorName}" permanently? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      setBusyId(comment.id);
      await adminBlogService.deleteComment(comment.id);
      setItems((prev) => prev.filter((item) => item.id !== comment.id));
      setTotal((prev) => Math.max(prev - 1, 0));
      addToast("Comment deleted.", "success");
    } catch {
      addToast("Failed to delete comment.", "error");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="admin-grid">
      <PageHeader
        title="Blog comments"
        description="Moderate reader comments: hide abusive ones or delete them permanently."
        breadcrumbs={["Admin", "Blog", "Comments"]}
      />

      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <select
            className="p-2 border rounded"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as AdminBlogCommentStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="Visible">Visible</option>
            <option value="Hidden">Hidden</option>
          </select>
          <button className="btn btn-outline" onClick={fetchComments}>
            Refresh
          </button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-10" />
            <div className="skeleton h-10" />
            <div className="skeleton h-10" />
          </div>
        ) : error ? (
          <EmptyState
            title="Unable to load comments"
            description={error}
            action={
              <button className="btn btn-primary" onClick={fetchComments}>
                Retry
              </button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="No comments found"
            description={status ? "No comments with this status." : "Nobody has commented yet."}
          />
        ) : (
          <>
            <div className="overflow-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Author</th>
                    <th className="text-left p-2">Comment</th>
                    <th className="text-left p-2">Post</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((comment) => (
                    <tr key={comment.id} className={`border-t align-top ${comment.status === "Hidden" ? "bg-amber-50/60" : ""}`}>
                      <td className="p-2 whitespace-nowrap text-xs text-slate-500">{formatDate(comment.createdAt)}</td>
                      <td className="p-2">
                        <div className="font-medium">{comment.authorName}</div>
                        <div className="flex gap-1 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${comment.isGuest ? "bg-slate-100 text-slate-700" : "bg-emerald-100 text-emerald-700"}`}>
                            {comment.isGuest ? "Guest" : "User"}
                          </span>
                          {comment.authorBanned && (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-red-100 text-red-700">Banned</span>
                          )}
                        </div>
                      </td>
                      <td className="p-2 max-w-[420px]">
                        <div className="whitespace-pre-wrap break-words">{comment.text}</div>
                      </td>
                      <td className="p-2 max-w-[220px]">
                        {comment.postSlug ? (
                          <Link className="text-violet-700 hover:underline" to={`/news/${comment.postSlug}`} target="_blank">
                            {comment.postTitle}
                          </Link>
                        ) : (
                          <span className="text-slate-500">{comment.postTitle}</span>
                        )}
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${comment.status === "Hidden" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
                          {comment.status}
                        </span>
                      </td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <button
                            className="btn btn-outline admin-table-action"
                            disabled={busyId === comment.id}
                            onClick={() => handleToggleStatus(comment)}
                          >
                            {comment.status === "Hidden" ? "Show" : "Hide"}
                          </button>
                          {!comment.isGuest && (
                            <button
                              className="btn btn-outline admin-table-action"
                              disabled={busyId === comment.id}
                              title={comment.authorBanned ? "Allow this author to comment again" : "Forbid this author from commenting"}
                              onClick={() => handleToggleBan(comment)}
                            >
                              {comment.authorBanned ? "Unban author" : "Ban author"}
                            </button>
                          )}
                          <button
                            className="btn btn-outline admin-table-action text-red-600 border-red-200 hover:border-red-400"
                            disabled={busyId === comment.id}
                            onClick={() => handleDelete(comment)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total} comments
              </p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Rows</label>
                <select
                  className="p-2 border rounded"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <button className="btn btn-outline" onClick={() => setPage((prev) => Math.max(prev - 1, 1))} disabled={page === 1}>
                  Previous
                </button>
                <button className="btn btn-outline" onClick={() => setPage((prev) => prev + 1)} disabled={page * pageSize >= total}>
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default BlogCommentsPage;
