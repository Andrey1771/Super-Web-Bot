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
    } catch (fetchError) {
      console.error("Failed to load blog posts", fetchError);
      setError("Unable to load blog posts.");
    } finally {
      setLoading(false);
    }
  }, [adminBlogService, page, pageSize, status, search, tag]);

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
              onRowClick={(event) => navigate(`/admin/blog/${event.data.id}/edit`)}
            >
              <Paging enabled={false} />
              <Column
                dataField="title"
                caption="Title"
                minWidth={240}
                cellRender={(cellData: { data: BlogPost }) => (
                  <div className="admin-table__cell-truncate" title={cellData.data.title}>
                    <div className="flex items-center gap-2">
                      <strong>{cellData.data.title}</strong>
                      {cellData.data.isMainEditorsPick && (
                        <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700">
                          Main Editor's Pick
                        </span>
                      )}
                    </div>
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
                caption="Actions"
                width={140}
                cellRender={(cellData: { data: BlogPost }) => (
                  <div className="flex gap-2">
                    <Link className="btn btn-outline" to={`/admin/blog/${cellData.data.id}/edit`}>
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
          </>
        )}
      </Card>
    </div>
  );
};

export default BlogPostsPage;
