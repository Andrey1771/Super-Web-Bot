import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DataGrid } from "devextreme-react";
import { Column, Paging } from "devextreme-react/data-grid";
import PageHeader from "../../../components/layout/PageHeader";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { useToast } from "../../../components/ui/ToastProvider";
import { useAdminHeader } from "../../../components/layout/AdminHeaderContext";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { IAdminBlogService } from "../../../iterfaces/i-admin-blog-service";
import type { BlogPost, BlogStatus } from "../../../types/blog";
import { Link, useNavigate } from "react-router-dom";

const statusOptions: Array<BlogStatus | ""> = ["", "DRAFT", "PUBLISHED", "SCHEDULED", "ARCHIVED"];

const BlogPostsPage: React.FC = () => {
  const adminBlogService = container.get<IAdminBlogService>(IDENTIFIERS.IAdminBlogService);
  const { addToast } = useToast();
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const navigate = useNavigate();

  const [items, setItems] = useState<BlogPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<BlogStatus | "">("");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mainHeroPostId, setMainHeroPostId] = useState<string>("");
  const [updatingMainHeroId, setUpdatingMainHeroId] = useState<string>("");
  const [mainHeroPostPreview, setMainHeroPostPreview] = useState<BlogPost | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminBlogService.getPosts({
        page,
        pageSize,
        status,
        search,
        tag,
      });
      setItems(response.items);
      setTotal(response.total);
      const settings = await adminBlogService.getHomeSettings();
      const selectedId = settings.mainHeroPostId ?? "";
      setMainHeroPostId(selectedId);
      if (!selectedId) {
        setMainHeroPostPreview(null);
      } else {
        const fromList = response.items.find((item) => item.id === selectedId) ?? null;
        if (fromList) {
          setMainHeroPostPreview(fromList);
        } else {
          try {
            const detail = await adminBlogService.getPost(selectedId);
            setMainHeroPostPreview(detail.post);
          } catch {
            setMainHeroPostPreview(null);
          }
        }
      }
    } catch (fetchError) {
      console.error("Failed to load blog posts", fetchError);
      setError("Unable to load blog posts.");
    } finally {
      setLoading(false);
    }
  }, [adminBlogService, page, pageSize, status, search, tag]);

  const handleSetMainHero = async (post: BlogPost) => {
    if (post.status !== "PUBLISHED") {
      addToast("Only published posts can be set as main hero.", "error");
      return;
    }

    try {
      setUpdatingMainHeroId(post.id);
      const nextMainHeroId = mainHeroPostId === post.id ? undefined : post.id;
      const result = await adminBlogService.setMainHeroPost(nextMainHeroId);
      setMainHeroPostId(result.mainHeroPostId ?? "");
      setMainHeroPostPreview(nextMainHeroId ? post : null);
      addToast(nextMainHeroId ? "Main hero updated." : "Main hero removed.", "success");
    } catch (updateError: any) {
      const message = updateError?.response?.data ?? "Failed to update main hero.";
      addToast(String(message), "error");
    } finally {
      setUpdatingMainHeroId("");
    }
  };

  const currentMainHero = useMemo(() => {
    return items.find((item) => item.id === mainHeroPostId) ?? mainHeroPostPreview;
  }, [items, mainHeroPostId, mainHeroPostPreview]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    setPageTitle("Blog posts");
    setHeaderActions([]);
    return () => setHeaderActions([]);
  }, [navigate, setHeaderActions, setPageTitle]);

  const handleReset = () => {
    setStatus("");
    setSearch("");
    setTag("");
    setPage(1);
  };

  const filteredTags = useMemo(() => {
    const tagSet = new Set<string>();
    items.forEach((post) => post.tags.forEach((value) => tagSet.add(value)));
    return Array.from(tagSet);
  }, [items]);

  return (
    <div className="admin-grid">
      <PageHeader
        title="Blog posts"
        description="Create, edit, schedule, and publish blog posts."
        breadcrumbs={["Admin", "Blog"]}
        primaryAction={(
          <button className="btn btn-primary" onClick={() => navigate("/admin/blog/new")}>
            New post
          </button>
        )}
      />

      <Card>
        <div className="admin-grid admin-grid--3">
          <div className="admin-topbar__search">
            <span>🔎</span>
            <input
              type="text"
              placeholder="Search title or slug..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            className="w-full p-2 border rounded"
            value={status}
            onChange={(event) => setStatus(event.target.value as BlogStatus | "")}
          >
            {statusOptions.map((option) => (
              <option key={option || "all"} value={option}>
                {option || "All statuses"}
              </option>
            ))}
          </select>
          <select
            className="w-full p-2 border rounded"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
          >
            <option value="">All tags</option>
            {filteredTags.map((tagOption) => (
              <option key={tagOption} value={tagOption}>
                {tagOption}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end mt-4 gap-2">
          <button className="btn btn-outline" onClick={handleReset}>
            Reset
          </button>
          <button className="btn btn-primary" onClick={fetchPosts}>
            Apply
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
            title="Unable to load posts"
            description={error}
            action={
              <button className="btn btn-primary" onClick={fetchPosts}>
                Retry
              </button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="No posts found"
            description="Create the first post to get started."
            action={
              <button className="btn btn-primary" onClick={() => navigate("/admin/blog/new")}>
                Create post
              </button>
            }
          />
        ) : (
          <>
            <DataGrid
              dataSource={items}
              showBorders
              showRowLines
              showColumnLines
              height={560}
              width="100%"
              keyExpr="id"
              allowColumnResizing
              columnAutoWidth
              columnHidingEnabled
              scrolling={{ mode: "standard", showScrollbar: "always" }}
              onRowClick={(event) => {
                const target = event.event?.target as HTMLElement | undefined;
                if (target?.closest(".admin-table-action")) {
                  return;
                }
                navigate(`/admin/blog/${event.data.id}/edit`);
              }}
              onRowPrepared={(event: any) => {
                if (event.rowType === "data" && event.data?.id === mainHeroPostId) {
                  event.rowElement?.classList.add("admin-blog-main-hero-row");
                }
              }}
            >
              <Paging enabled={false} />
              <Column
                dataField="title"
                caption="Title"
                minWidth={240}
                cellRender={(cellData: { data: BlogPost }) => (
                  <div className="admin-table__cell-truncate" title={cellData.data.title}>
                    <strong>{cellData.data.title}</strong>
                    <div className="admin-table__cell-muted">{cellData.data.excerpt}</div>
                  </div>
                )}
              />
              <Column
                dataField="status"
                caption="Status"
                minWidth={140}
                cellRender={(cellData: { data: BlogPost }) => (
                  <span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700">
                    {cellData.data.status}
                  </span>
                )}
              />
              <Column
                caption="Published/Scheduled"
                minWidth={180}
                cellRender={(cellData: { data: BlogPost }) => (
                  <span>
                    {cellData.data.publishedAt ?? cellData.data.scheduledAt ?? "—"}
                  </span>
                )}
              />
              <Column dataField="updatedAt" caption="Updated" minWidth={170} />
              <Column
                dataField="slug"
                caption="Slug"
                minWidth={180}
                cellRender={(cellData: { data: BlogPost }) => (
                  <span className="admin-table__cell-truncate" title={cellData.data.slug}>
                    {cellData.data.slug}
                  </span>
                )}
              />
              <Column
                caption="Tags"
                minWidth={200}
                cellRender={(cellData: { data: BlogPost }) => (
                  <div className="flex flex-wrap gap-1">
                    {cellData.data.tags.map((tagValue) => (
                      <span key={tagValue} className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700">
                        {tagValue}
                      </span>
                    ))}
                  </div>
                )}
              />
              <Column
                caption="Main hero"
                minWidth={120}
                cellRender={(cellData: { data: BlogPost }) => (
                  <button
                    type="button"
                    className={`admin-table-action px-3 py-1 rounded-full text-xs border transition-colors ${mainHeroPostId === cellData.data.id ? "bg-violet-100 text-violet-700 border-violet-300" : "bg-white text-slate-600 border-slate-300 hover:border-violet-300 hover:text-violet-700"}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleSetMainHero(cellData.data);
                    }}
                    disabled={updatingMainHeroId === cellData.data.id || cellData.data.status !== "PUBLISHED"}
                    title={cellData.data.status !== "PUBLISHED" ? "Only published posts can be main hero" : mainHeroPostId === cellData.data.id ? "Clear main hero" : "Set as main hero"}
                  >
                    {updatingMainHeroId === cellData.data.id ? "Updating..." : mainHeroPostId === cellData.data.id ? "Main Hero ✓" : "Set as main"}
                  </button>
                )}
              />
              <Column
                caption="Actions"
                width={140}
                cellRender={(cellData: { data: BlogPost }) => (
                  <div className="flex gap-2">
                    <Link className="btn btn-outline admin-table-action" to={`/admin/blog/${cellData.data.id}/edit`}>
                      Edit
                    </Link>
                  </div>
                )}
              />
            </DataGrid>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total} posts
              </p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Rows</label>
                <select
                  className="p-2 border rounded"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                >
                  {[10, 20, 50].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-outline"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={page === 1}
                >
                  Previous
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={page * pageSize >= total}
                >
                  Next
                </button>
              </div>
            </div>
            <div className="mt-4 p-4 border rounded-xl bg-violet-50/60 border-violet-100">
              <h4 className="text-sm font-semibold text-slate-800">Current Main Blog Hero</h4>
              {currentMainHero ? (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-700">
                  <strong className="text-slate-900">{currentMainHero.title}</strong>
                  <span className="text-slate-500">/{currentMainHero.slug}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-white border border-violet-200 text-violet-700">{currentMainHero.status}</span>
                  <Link className="btn btn-outline" to={`/admin/blog/${currentMainHero.id}/edit`}>
                    Open
                  </Link>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">No main hero selected. Choose a published article in the table above.</p>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default BlogPostsPage;
