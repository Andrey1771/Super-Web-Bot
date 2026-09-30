import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataGrid, Column, Paging, Scrolling, Sorting } from "../../../components/grid";
import PageHeader from "../../../components/layout/PageHeader";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { useToast } from "../../../components/ui/ToastProvider";
import { useAdminHeader } from "../../../components/layout/AdminHeaderContext";
import { GRID_PAGE_SIZE, REMOTE_PAGING, gridStatusText, useGridWindow } from "../../../hooks/use-grid-window";
import { fetchWindow } from "../../../utils/page-window";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { AdminBlogComment, AdminBlogCommentStatus, IAdminBlogService } from "../../../iterfaces/i-admin-blog-service";
import { formatDateTimeOrDash as formatDate } from "../../../i18n/format";

/**
 * Модерация комментариев блога: общий список по всем постам (включая скрытые),
 * скрытие/возврат, бан автора и безвозвратное удаление.
 *
 * Комментарии копятся без предела, поэтому список едет окнами по мере прокрутки, а не
 * страницами с кнопками Previous/Next.
 */
const BlogCommentsPage: React.FC = () => {
  const adminBlogService = container.get<IAdminBlogService>(IDENTIFIERS.IAdminBlogService);
  const { addToast } = useToast();
  const { setPageTitle } = useAdminHeader();

  const [status, setStatus] = useState<AdminBlogCommentStatus | "">("");
  const [reloadToken, setReloadToken] = useState(0);
  const [busyId, setBusyId] = useState<string>("");

  const loadComments = useCallback(
    (skip: number, take: number) =>
      fetchWindow(skip, take, GRID_PAGE_SIZE, (page, pageSize) =>
        adminBlogService.getComments({ page, pageSize, status })
      ),
    [adminBlogService, status]
  );

  const { source, retry, loaded, total, error } = useGridWindow<AdminBlogComment>(loadComments, "id", reloadToken);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    setPageTitle("Blog comments");
  }, [setPageTitle]);

  const handleToggleStatus = async (comment: AdminBlogComment) => {
    const nextStatus: AdminBlogCommentStatus = comment.status === "Hidden" ? "Visible" : "Hidden";
    try {
      setBusyId(comment.id);
      await adminBlogService.setCommentStatus(comment.id, nextStatus);
      addToast(nextStatus === "Hidden" ? "Comment hidden from the site." : "Comment is visible again.", "success");
      reload();
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
      // Бан общий на автора: флаг меняется у всех его строк сразу — перечитываем список.
      reload();
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
      addToast("Comment deleted.", "success");
      reload();
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
        breadcrumbs={["Content", "Blog", "Comments"]}
      />

      <Card>
        {/* Фильтр — часть списка, а не отдельный блок над ним: сам по себе он ничего не
            показывает. */}
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <select
            className="p-2 border rounded-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as AdminBlogCommentStatus | "")}
          >
            <option value="">All statuses</option>
            <option value="Visible">Visible</option>
            <option value="Hidden">Hidden</option>
          </select>
          <button className="btn btn-outline" onClick={reload}>
            Refresh
          </button>
        </div>

        {error ? (
          <EmptyState
            title="Unable to load comments"
            description={error}
            action={
              <button className="btn btn-primary" onClick={retry}>
                Retry
              </button>
            }
          />
        ) : (
          <>
            <DataGrid
              dataSource={source}
              showBorders
              showRowLines
              height={620}
              width="100%"
              columnAutoWidth
              allowColumnResizing
              columnResizingMode="widget"
              wordWrapEnabled
              remoteOperations={REMOTE_PAGING}
              noDataText={status ? "No comments with this status." : "Nobody has commented yet."}
              onRowPrepared={(event) => {
                // Скрытые комментарии подсвечиваем — модератору важно видеть их сразу.
                if (event.rowType === "data" && (event.data as AdminBlogComment).status === "Hidden") {
                  event.rowElement.style.backgroundColor = "rgb(255 251 235)";
                }
              }}
            >
              <Scrolling mode="virtual" rowRenderingMode="virtual" showScrollbar="always" />
              <Paging enabled pageSize={GRID_PAGE_SIZE} />
              <Sorting mode="none" />

              <Column
                dataField="createdAt"
                caption="Date"
                width={160}
                cellRender={(cell: { value: string }) => (
                  <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(cell.value)}</span>
                )}
              />
              <Column
                caption="Author"
                minWidth={160}
                cellRender={(cell: { data: AdminBlogComment }) => (
                  <div>
                    <div className="font-medium">{cell.data.authorName}</div>
                    <div className="flex gap-1 flex-wrap">
                      <span
                        className={
                          cell.data.isGuest
                            ? "px-2 py-0.5 rounded-sm text-[10px] bg-slate-100 text-slate-700"
                            : "px-2 py-0.5 rounded-sm text-[10px] bg-emerald-100 text-emerald-700"
                        }
                      >
                        {cell.data.isGuest ? "Guest" : "User"}
                      </span>
                      {cell.data.authorBanned && (
                        <span className="px-2 py-0.5 rounded-sm text-[10px] bg-red-100 text-red-700">Banned</span>
                      )}
                    </div>
                  </div>
                )}
              />
              <Column
                dataField="text"
                caption="Comment"
                minWidth={280}
                cellRender={(cell: { value: string }) => (
                  <div className="whitespace-pre-wrap wrap-break-word line-clamp-3" title={cell.value}>
                    {cell.value}
                  </div>
                )}
              />
              <Column
                caption="Post"
                minWidth={180}
                cellRender={(cell: { data: AdminBlogComment }) =>
                  cell.data.postSlug ? (
                    <Link className="text-violet-700 hover:underline" to={`/news/${cell.data.postSlug}`} target="_blank">
                      {cell.data.postTitle}
                    </Link>
                  ) : (
                    <span className="text-slate-500">{cell.data.postTitle}</span>
                  )
                }
              />
              <Column
                dataField="status"
                caption="Status"
                width={110}
                cellRender={(cell: { value: AdminBlogCommentStatus }) => (
                  <span
                    className={
                      cell.value === "Hidden"
                        ? "px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-800"
                        : "px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700"
                    }
                  >
                    {cell.value}
                  </span>
                )}
              />
              <Column
                caption="Actions"
                width={260}
                cellRender={(cell: { data: AdminBlogComment }) => (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      className="btn btn-outline admin-table-action"
                      disabled={busyId === cell.data.id}
                      onClick={() => handleToggleStatus(cell.data)}
                    >
                      {cell.data.status === "Hidden" ? "Show" : "Hide"}
                    </button>
                    {!cell.data.isGuest && (
                      <button
                        className="btn btn-outline admin-table-action"
                        disabled={busyId === cell.data.id}
                        title={cell.data.authorBanned ? "Allow commenting again" : "Forbid this author from commenting"}
                        onClick={() => handleToggleBan(cell.data)}
                      >
                        {cell.data.authorBanned ? "Unban author" : "Ban author"}
                      </button>
                    )}
                    <button
                      className="btn btn-outline admin-table-action text-red-600 border-red-200 hover:border-red-400"
                      disabled={busyId === cell.data.id}
                      onClick={() => handleDelete(cell.data)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              />
            </DataGrid>

            <p className="mt-3 text-xs text-gray-500">{gridStatusText(loaded, total, "comment")}</p>
          </>
        )}
      </Card>
    </div>
  );
};

export default BlogCommentsPage;
