import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DataGrid } from "devextreme-react";
import { Column, Paging } from "devextreme-react/data-grid";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import PageHeader from "../../../components/layout/PageHeader";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { useToast } from "../../../components/ui/ToastProvider";
import { useAdminHeader } from "../../../components/layout/AdminHeaderContext";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { AdminBlogBreakdown, AdminBlogOverviewAnalytics, AdminBlogPostAnalytics, IAdminBlogService } from "../../../iterfaces/i-admin-blog-service";
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
  const [viewSettings, setViewSettings] = useState<{
    countGuestViewsInPublicCounts: boolean;
    publicUniqueViews: number;
    authenticatedUniqueViews: number;
    guestUniqueViewsTotal: number;
    guestUniqueViewsCounted: number;
    guestUniqueViewsExcluded: number;
    guestUniqueViewsNotCountedBySetting: number;
  } | null>(null);
  const [viewSettingsBusy, setViewSettingsBusy] = useState(false);
  const [analyticsByPostId, setAnalyticsByPostId] = useState<Record<string, AdminBlogPostAnalytics>>({});
  const [analyticsPostId, setAnalyticsPostId] = useState<string>("");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsMode, setAnalyticsMode] = useState<"overview" | "post">("overview");
  const [overviewAnalytics, setOverviewAnalytics] = useState<AdminBlogOverviewAnalytics | null>(null);
  const [postSearchTerm, setPostSearchTerm] = useState("");
  const [breakdown, setBreakdown] = useState<AdminBlogBreakdown | null>(null);

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
      const views = await adminBlogService.getViewSettings();
      const analytics = await adminBlogService.getPostsAnalytics(response.items.map((item) => item.id));
      const analyticsMap = analytics.reduce<Record<string, AdminBlogPostAnalytics>>((acc, entry) => {
        acc[entry.postId] = entry;
        return acc;
      }, {});
      const selectedId = settings.mainHeroPostId ?? "";
      setViewSettings(views);
      setAnalyticsByPostId(analyticsMap);
      setMainHeroPostId(selectedId);
      const defaultAnalyticsId = analyticsPostId
        || response.items.find((item) => item.status === "PUBLISHED")?.id
        || response.items[0]?.id
        || "";
      if (defaultAnalyticsId) {
        setAnalyticsPostId(defaultAnalyticsId);
        const full = await adminBlogService.getPostAnalytics(defaultAnalyticsId);
        setAnalyticsByPostId((prev) => ({ ...prev, [defaultAnalyticsId]: full }));
      }
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
  }, [adminBlogService, page, pageSize, status, search, tag, analyticsPostId]);

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

  const hasViewSettings = viewSettings !== null;
  const canExcludeGuestViews = !hasViewSettings || (viewSettings?.guestUniqueViewsCounted ?? 0) > 0;
  const canRestoreGuestViews = !hasViewSettings || (viewSettings?.guestUniqueViewsExcluded ?? 0) > 0;
  const canDeleteGuestViews = !hasViewSettings || (viewSettings?.guestUniqueViewsTotal ?? 0) > 0;

  const handleToggleGuestViews = async (nextValue: boolean) => {
    try {
      setViewSettingsBusy(true);
      await adminBlogService.updateViewSettings({ countGuestViewsInPublicCounts: nextValue });
      const fresh = await adminBlogService.getViewSettings();
      setViewSettings(fresh);
      addToast("View settings updated.", "success");
    } catch {
      addToast("Failed to update view settings.", "error");
    } finally {
      setViewSettingsBusy(false);
    }
  };

  const handleExcludeGuestViews = async () => {
    try {
      setViewSettingsBusy(true);
      const result = await adminBlogService.excludeGuestViews();
      const fresh = await adminBlogService.getViewSettings();
      setViewSettings(fresh);
      addToast(result.modified > 0 ? "Guest views excluded from public counters." : "No counted guest views were available to exclude.", "success");
    } catch {
      addToast("Failed to exclude guest views.", "error");
    } finally {
      setViewSettingsBusy(false);
    }
  };

  const handleDeleteGuestViews = async () => {
    try {
      setViewSettingsBusy(true);
      const result = await adminBlogService.deleteGuestViews();
      const fresh = await adminBlogService.getViewSettings();
      setViewSettings(fresh);
      addToast(result.deleted > 0 ? "Guest unique views deleted." : "No guest unique views were available to delete.", "success");
    } catch {
      addToast("Failed to delete guest views.", "error");
    } finally {
      setViewSettingsBusy(false);
    }
  };

  const handleRestoreGuestViews = async () => {
    try {
      setViewSettingsBusy(true);
      const result = await adminBlogService.restoreGuestViews();
      const fresh = await adminBlogService.getViewSettings();
      setViewSettings(fresh);
      addToast(result.modified > 0 ? "Excluded guest views restored to public counters." : "No excluded guest views were available to restore.", "success");
    } catch {
      addToast("Failed to restore guest views.", "error");
    } finally {
      setViewSettingsBusy(false);
    }
  };

  const openAnalytics = async (postId: string) => {
    setAnalyticsMode("post");
    setAnalyticsPostId(postId);
    const analyticsSection = document.getElementById("post-analytics-section");
    analyticsSection?.scrollIntoView({ behavior: "smooth", block: "start" });

    if (analyticsByPostId[postId]?.latestEvents) {
      return;
    }

    try {
      setAnalyticsLoading(true);
      const data = await adminBlogService.getPostAnalytics(postId);
      setAnalyticsByPostId((prev) => ({ ...prev, [postId]: data }));
    } catch {
      addToast("Failed to load post analytics.", "error");
    } finally {
      setAnalyticsLoading(false);
    }
  };

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

  const activeAnalytics = analyticsPostId ? analyticsByPostId[analyticsPostId] : null;
  const currentAnalytics = analyticsMode === "overview" ? overviewAnalytics : activeAnalytics;
  const selectedPost = items.find((item) => item.id === analyticsPostId) ?? null;

  const loadOverviewAnalytics = useCallback(async () => {
    try {
      setAnalyticsLoading(true);
      const overview = await adminBlogService.getOverviewAnalytics();
      setOverviewAnalytics(overview);
    } catch {
      addToast("Failed to load overview analytics.", "error");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [addToast, adminBlogService]);

  useEffect(() => {
    if (analyticsMode === "overview" && !overviewAnalytics) {
      loadOverviewAnalytics();
    }
  }, [analyticsMode, overviewAnalytics, loadOverviewAnalytics]);

  const viewsChartOptions: Highcharts.Options = {
    chart: { type: "area", height: 280 },
    title: { text: analyticsMode === "overview" ? "Views over time - All posts" : `Views over time - ${selectedPost?.title ?? "Selected post"}` },
    xAxis: { categories: (currentAnalytics?.viewsTimeline ?? []).map((item) => new Date(item.bucketStart).toLocaleDateString()) },
    plotOptions: {
      series: {
        point: {
          events: {
            click: function (this: any) {
              if (analyticsMode === "overview") {
                const point = currentAnalytics?.viewsTimeline?.[this.index as number];
                if (point) {
                  adminBlogService.getOverviewBreakdown({ metric: "views_bucket", bucket: point.bucketStart }).then(setBreakdown);
                }
              }
            }
          }
        }
      }
    },
    series: [{ type: "area", name: "Views", data: (currentAnalytics?.viewsTimeline ?? []).map((item) => item.count) }],
    credits: { enabled: false }
  };

  const reactionsChartOptions: Highcharts.Options = {
    chart: { type: "column", height: 280 },
    title: { text: analyticsMode === "overview" ? "Reactions over time - All posts" : `Reactions over time - ${selectedPost?.title ?? "Selected post"}` },
    xAxis: { categories: (currentAnalytics?.reactionsTimeline ?? []).map((item) => new Date(item.bucketStart).toLocaleDateString()) },
    plotOptions: {
      series: {
        point: {
          events: {
            click: function (this: any) {
              if (analyticsMode === "overview") {
                const point = currentAnalytics?.reactionsTimeline?.[this.index as number];
                if (point) {
                  adminBlogService.getOverviewBreakdown({ metric: "reactions_bucket", bucket: point.bucketStart }).then(setBreakdown);
                }
              }
            }
          }
        }
      }
    },
    series: [{ type: "column", name: "Reactions", data: (currentAnalytics?.reactionsTimeline ?? []).map((item) => item.count) }],
    credits: { enabled: false }
  };

  const distributionOptions: Highcharts.Options = {
    chart: { type: "pie", height: 280 },
    title: { text: analyticsMode === "overview" ? "Reaction distribution - All posts" : `Reaction distribution - ${selectedPost?.title ?? "Selected post"}` },
    series: [{
      type: "pie",
      name: "Reactions",
      data: Object.entries(currentAnalytics?.reactionsByEmoji ?? {}).map(([name, y]) => ({ name, y })),
      point: {
        events: {
          click: function (this: any) {
            if (analyticsMode === "overview") {
              adminBlogService.getOverviewBreakdown({ metric: "emoji", emoji: this.name }).then(setBreakdown);
            }
          }
        }
      }
    }],
    credits: { enabled: false }
  };

  const filteredTags = useMemo(() => {
    const tagSet = new Set<string>();
    items.forEach((post) => post.tags.forEach((value) => tagSet.add(value)));
    return Array.from(tagSet);
  }, [items]);

  const drillDownOptions = useMemo(() => {
    const term = postSearchTerm.trim().toLowerCase();
    return items
      .filter((item) => !term || item.title.toLowerCase().includes(term) || item.slug.toLowerCase().includes(term))
      .slice(0, 12);
  }, [items, postSearchTerm]);

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
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-slate-800">Public blog view settings</h4>
          <p className="text-xs text-slate-500">
            This toggle only controls whether new guest unique views are counted in public counters.
          </p>
          <p className="text-xs text-slate-500">
            Existing guest views are excluded only by the Exclude action and removed only by the Delete action.
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={viewSettings?.countGuestViewsInPublicCounts ?? true}
              disabled={viewSettingsBusy}
              onChange={(event) => handleToggleGuestViews(event.target.checked)}
            />
            Count guest views in public blog counters
          </label>
          <div className="flex flex-wrap gap-3 text-sm text-slate-700">
            <span className="px-2 py-1 rounded bg-slate-100">Public unique views: {viewSettings?.publicUniqueViews ?? 0}</span>
            <span className="px-2 py-1 rounded bg-slate-100">Authenticated unique views: {viewSettings?.authenticatedUniqueViews ?? 0}</span>
            <span className="px-2 py-1 rounded bg-slate-100">Guest unique views total: {viewSettings?.guestUniqueViewsTotal ?? 0}</span>
            <span className="px-2 py-1 rounded bg-slate-100">Guest counted: {viewSettings?.guestUniqueViewsCounted ?? 0}</span>
            <span className="px-2 py-1 rounded bg-slate-100">Guest excluded: {viewSettings?.guestUniqueViewsExcluded ?? 0}</span>
            <span className="px-2 py-1 rounded bg-slate-100">Guest not counted by setting: {viewSettings?.guestUniqueViewsNotCountedBySetting ?? 0}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-outline" disabled={viewSettingsBusy || !canExcludeGuestViews} onClick={handleExcludeGuestViews}>
              Exclude existing guest views from public counts
            </button>
            <button
              className="btn btn-outline"
              disabled={viewSettingsBusy || !canRestoreGuestViews}
              onClick={handleRestoreGuestViews}
            >
              Restore excluded guest views
            </button>
            <button className="btn btn-outline" disabled={viewSettingsBusy || !canDeleteGuestViews} onClick={handleDeleteGuestViews}>
              Delete all guest unique views
            </button>
          </div>
          <div className="flex flex-col gap-1 text-xs text-slate-500">
            {hasViewSettings && !canExcludeGuestViews && <p>No counted guest views available to exclude.</p>}
            {hasViewSettings && !canRestoreGuestViews && <p>No manually excluded guest views available to restore.</p>}
            {hasViewSettings && !canDeleteGuestViews && <p>No guest views available to delete.</p>}
          </div>
        </div>
      </Card>

      <Card>
        <div id="post-analytics-section" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Post analytics</h4>
              <p className="text-xs text-slate-500">
                Scope: {analyticsMode === "overview" ? "All posts" : `All posts / ${selectedPost?.title ?? "Selected post"}`}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              {analyticsMode === "post" && (
                <button className="btn btn-outline" onClick={() => setAnalyticsMode("overview")}>
                  Back to overview
                </button>
              )}
              <div className="relative">
                <input
                  className="p-2 border rounded min-w-[260px]"
                  placeholder="Open post analytics..."
                  value={postSearchTerm}
                  onChange={(event) => setPostSearchTerm(event.target.value)}
                />
                {postSearchTerm && (
                  <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto bg-white border rounded shadow">
                    {drillDownOptions.map((item) => (
                      <button
                        key={`drill-${item.id}`}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                        onClick={() => {
                          setPostSearchTerm("");
                          openAnalytics(item.id);
                        }}
                      >
                        <div className="font-medium">{item.title}</div>
                        <div className="text-xs text-slate-500">/{item.slug}</div>
                      </button>
                    ))}
                    {drillDownOptions.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No posts found</div>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {analyticsMode === "post" && analyticsPostId && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-slate-50">
              <div className="text-sm">
                <div className="text-slate-500 text-xs">Selected post</div>
                <div className="font-medium">{selectedPost?.title ?? analyticsPostId}</div>
              </div>
              <Link className="btn btn-outline" to={`/admin/blog/${analyticsPostId}/edit`}>Open edit</Link>
            </div>
          )}

          {analyticsLoading && !currentAnalytics ? (
            <div className="text-sm text-slate-500">Loading analytics...</div>
          ) : !currentAnalytics ? (
            <div className="text-sm text-slate-500">No analytics selected yet.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <button className="p-3 rounded-xl border bg-white text-left" onClick={() => analyticsMode === "overview" && adminBlogService.getOverviewBreakdown({ metric: "public_views" }).then(setBreakdown)}>
                  <div className="text-slate-500">{analyticsMode === "overview" ? "All posts public views" : "This post public views"}</div>
                  <strong className="text-lg">{currentAnalytics.publicUniqueViews}</strong>
                </button>
                <button className="p-3 rounded-xl border bg-white text-left" onClick={() => analyticsMode === "overview" && adminBlogService.getOverviewBreakdown({ metric: "auth_views" }).then(setBreakdown)}>
                  <div className="text-slate-500">{analyticsMode === "overview" ? "All posts auth views" : "This post auth views"}</div>
                  <strong className="text-lg">{currentAnalytics.authenticatedUniqueViews}</strong>
                </button>
                <button className="p-3 rounded-xl border bg-white text-left" onClick={() => analyticsMode === "overview" && adminBlogService.getOverviewBreakdown({ metric: "guest_views" }).then(setBreakdown)}>
                  <div className="text-slate-500">{analyticsMode === "overview" ? "All posts guest views" : "This post guest views"}</div>
                  <strong className="text-lg">{currentAnalytics.guestUniqueViewsTotal}</strong>
                </button>
                <div className="p-3 rounded-xl border bg-white">
                  <div className="text-slate-500">{analyticsMode === "overview" ? "All posts completed reads" : "This post completed reads"}</div>
                  <strong className="text-lg">{currentAnalytics.completedReads}</strong>
                </div>
                <button className="p-3 rounded-xl border bg-white text-left" onClick={() => analyticsMode === "overview" && adminBlogService.getOverviewBreakdown({ metric: "reactions" }).then(setBreakdown)}>
                  <div className="text-slate-500">{analyticsMode === "overview" ? "All posts reactions" : "This post reactions"}</div>
                  <strong className="text-lg">{currentAnalytics.totalReactions}</strong>
                </button>
                <button className="p-3 rounded-xl border bg-white text-left" onClick={() => analyticsMode === "overview" && currentAnalytics.topReaction && adminBlogService.getOverviewBreakdown({ metric: "emoji", emoji: currentAnalytics.topReaction }).then(setBreakdown)}>
                  <div className="text-slate-500">{analyticsMode === "overview" ? "Top emoji across all posts" : "Top emoji for this post"}</div>
                  <strong className="text-lg">{currentAnalytics.topReaction || "—"}</strong>
                </button>
                <div className="p-3 rounded-xl border bg-white">
                  <div className="text-slate-500">Guest counted</div>
                  <strong className="text-lg">{currentAnalytics.guestUniqueViewsCounted}</strong>
                </div>
                <div className="p-3 rounded-xl border bg-white">
                  <div className="text-slate-500">Guest excluded</div>
                  <strong className="text-lg">{currentAnalytics.guestUniqueViewsExcluded}</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <HighchartsReact highcharts={Highcharts} options={viewsChartOptions} />
                <HighchartsReact highcharts={Highcharts} options={reactionsChartOptions} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <HighchartsReact highcharts={Highcharts} options={distributionOptions} />
                {analyticsMode === "overview" && overviewAnalytics ? (
                  <div className="border rounded-xl p-3 bg-white">
                    <h4 className="text-sm font-semibold mb-2">Top posts</h4>
                    <div className="text-xs space-y-1">
                      {overviewAnalytics.topPostsByViews.slice(0, 8).map((post) => (
                        <button
                          key={`top-view-${post.postId}`}
                          className="flex justify-between w-full text-left hover:bg-slate-50 px-2 py-1 rounded"
                            onClick={() => {
                              adminBlogService.getOverviewBreakdown({ metric: "public_views" }).then(setBreakdown);
                              openAnalytics(post.postId);
                            }}
                        >
                          <span>{post.title}</span>
                          <span className="flex items-center gap-2"><strong>{post.views}</strong><span className="text-[10px] text-violet-600">Inspect</span></span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : <div />}
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">
                  {analyticsMode === "overview"
                    ? "Latest activity across all posts"
                    : `Latest activity for ${selectedPost?.title ?? "selected post"}`}
                </h4>
                <div className="max-h-56 overflow-auto border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left p-2">Time</th>
                        <th className="text-left p-2">Actor</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Reaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(currentAnalytics.latestEvents ?? []).map((item, index) => (
                        <tr key={`${item.timestamp}-inline-${index}`} className="border-t">
                          <td className="p-2">{new Date(item.timestamp).toLocaleString()}</td>
                          <td className="p-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] mr-1 ${item.actorType === "authenticated" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                              {item.actorType === "authenticated" ? "Auth" : "Guest"}
                            </span>
                            {item.actorDisplay}
                          </td>
                          <td className="p-2">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-violet-100 text-violet-700">{item.eventType}</span>
                          </td>
                          <td className="p-2">{item.reaction ? <span className="text-lg">{item.reaction}</span> : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {breakdown && (
                <div className="border rounded-xl p-3 bg-white">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Analytics breakdown</h4>
                    <button className="btn btn-outline" onClick={() => setBreakdown(null)}>Clear breakdown</button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{breakdown.title}</p>
                  <div className="max-h-56 overflow-auto mt-2 border rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left p-2">Post</th>
                          <th className="text-left p-2">Value</th>
                          <th className="text-left p-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.items.map((item) => (
                          <tr key={`bd-${item.postId}`} className="border-t">
                            <td className="p-2">{item.title}</td>
                            <td className="p-2">{item.value}</td>
                            <td className="p-2">
                              <button className="btn btn-outline" onClick={() => openAnalytics(item.postId)}>Open post analytics</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
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
              <Column
                caption="Reading"
                minWidth={110}
                cellRender={(cellData: { data: BlogPost }) => (
                  <span>{cellData.data.readingTime ? `${cellData.data.readingTime} min` : "—"}</span>
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
                caption="Public views"
                minWidth={110}
                cellRender={(cellData: { data: BlogPost }) => (
                  <span>{analyticsByPostId[cellData.data.id]?.publicUniqueViews ?? 0}</span>
                )}
              />
              <Column
                caption="Auth views"
                minWidth={95}
                cellRender={(cellData: { data: BlogPost }) => (
                  <span>{analyticsByPostId[cellData.data.id]?.authenticatedUniqueViews ?? 0}</span>
                )}
              />
              <Column
                caption="Guest views"
                minWidth={100}
                cellRender={(cellData: { data: BlogPost }) => (
                  <span>{analyticsByPostId[cellData.data.id]?.guestUniqueViewsTotal ?? 0}</span>
                )}
              />
              <Column
                caption="Reactions"
                minWidth={90}
                cellRender={(cellData: { data: BlogPost }) => (
                  <span>{analyticsByPostId[cellData.data.id]?.totalReactions ?? 0}</span>
                )}
              />
              <Column
                caption="Top emoji"
                minWidth={90}
                cellRender={(cellData: { data: BlogPost }) => (
                  <span>{analyticsByPostId[cellData.data.id]?.topReaction || "—"}</span>
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
                    disabled={updatingMainHeroId === cellData.data.id}
                    title={cellData.data.status !== "PUBLISHED" ? "Only published posts can be main hero" : mainHeroPostId === cellData.data.id ? "Clear main hero" : "Set as main hero"}
                  >
                    {updatingMainHeroId === cellData.data.id ? "Updating..." : mainHeroPostId === cellData.data.id ? "Main Hero ✓" : "Set as main"}
                  </button>
                )}
              />
              <Column
                caption="Actions"
                width={210}
                cellRender={(cellData: { data: BlogPost }) => (
                  <div className="flex gap-2">
                    <button className="btn btn-outline admin-table-action" onClick={() => openAnalytics(cellData.data.id)}>
                      View analytics
                    </button>
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
