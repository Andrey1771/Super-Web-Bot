import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "../../../components/layout/PageHeader";
import Card from "../../../components/ui/Card";
import Drawer from "../../../components/ui/Drawer";
import ModalConfirm from "../../../components/ui/ModalConfirm";
import EmptyState from "../../../components/ui/EmptyState";
import { useAdminHeader } from "../../../components/layout/AdminHeaderContext";
import { useToast } from "../../../components/ui/ToastProvider";
import MediaPickerModal from "../../../components/admin-panel/media-library/MediaPickerModal";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { IAdminBlogService } from "../../../iterfaces/i-admin-blog-service";
import type { AdminBlogPayload } from "../../../iterfaces/i-admin-blog-service";
import type { BlogPost, BlogPostVersion, BlogStatus } from "../../../types/blog";
import { renderMarkdown } from "../../../utils/markdown";
import { slugify } from "../../../utils/slugify";

const statusOptions: BlogStatus[] = ["DRAFT", "PUBLISHED", "SCHEDULED", "ARCHIVED"];

const BlogPostEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new" || !id;
  const adminBlogService = container.get<IAdminBlogService>(IDENTIFIERS.IAdminBlogService);
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [post, setPost] = useState<BlogPost | null>(null);
  const [version, setVersion] = useState<BlogPostVersion | null>(null);
  const [versions, setVersions] = useState<BlogPostVersion[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [statusDraft, setStatusDraft] = useState<BlogStatus>("DRAFT");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [publishedAt, setPublishedAt] = useState<string>("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<BlogPostVersion | null>(null);

  const [form, setForm] = useState<AdminBlogPayload>({
    title: "",
    slug: "",
    excerpt: "",
    contentMarkdown: "",
    contentHtml: "",
    coverAssetId: "",
    tags: [],
    status: "DRAFT",
    scheduledAt: "",
    publishedAt: "",
    changeNote: "",
  });
  const formRef = useRef(form);
  const scheduledAtRef = useRef(scheduledAt);
  const publishedAtRef = useRef(publishedAt);
  const changeNoteRef = useRef(changeNote);

  const handleChange = (field: keyof AdminBlogPayload, value: string | string[]) => {
    setForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };
      formRef.current = next;
      return next;
    });
  };

  const handleScheduledAtChange = (value: string) => {
    scheduledAtRef.current = value;
    setScheduledAt(value);
  };

  const handlePublishedAtChange = (value: string) => {
    publishedAtRef.current = value;
    setPublishedAt(value);
  };

  const handleChangeNote = (value: string) => {
    changeNoteRef.current = value;
    setChangeNote(value);
  };

  const tagsText = useMemo(() => form.tags.join(", "), [form.tags]);
  const titleCount = form.title.trim().length;
  const excerptCount = form.excerpt.trim().length;
  const tagsCount = form.tags.length;

  const previewHtml = useMemo(() => renderMarkdown(form.contentMarkdown ?? ""), [form.contentMarkdown]);

  const fetchPost = async () => {
    try {
      setLoading(true);
      const response = await adminBlogService.getPost(id ?? "");
      setPost(response.post);
      setVersion(response.version);
      const nextForm = {
        title: response.post.title,
        slug: response.post.slug,
        excerpt: response.post.excerpt,
        contentMarkdown: response.version.contentMarkdown ?? "",
        contentHtml: response.version.contentHtml ?? "",
        coverAssetId: response.post.coverAssetId ?? "",
        tags: response.post.tags,
        status: response.post.status,
        scheduledAt: response.post.scheduledAt ?? "",
        publishedAt: response.post.publishedAt ?? "",
        changeNote: "",
      };
      formRef.current = nextForm;
      setForm(nextForm);
      setStatusDraft(response.post.status);
      const nextScheduledAt = response.post.scheduledAt ?? "";
      const nextPublishedAt = response.post.publishedAt ?? "";
      scheduledAtRef.current = nextScheduledAt;
      publishedAtRef.current = nextPublishedAt;
      changeNoteRef.current = "";
      setScheduledAt(nextScheduledAt);
      setPublishedAt(nextPublishedAt);
      setChangeNote("");
      const versionsList = await adminBlogService.getVersions(response.post.id);
      setVersions(versionsList as BlogPostVersion[]);
    } catch (fetchError) {
      console.error(fetchError);
      setError("Unable to load blog post.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = useCallback(async (statusOverride?: BlogStatus) => {
    const currentForm = formRef.current;
    const payload: AdminBlogPayload = {
      ...currentForm,
      slug: currentForm.slug ? slugify(currentForm.slug) : slugify(currentForm.title),
      tags: currentForm.tags,
      status: statusOverride ?? currentForm.status,
      scheduledAt: scheduledAtRef.current || undefined,
      publishedAt: publishedAtRef.current || undefined,
      changeNote: changeNoteRef.current || undefined,
    };

    try {
      if (isNew) {
        const created = await adminBlogService.createPost(payload);
        addToast("Post created", "success");
        navigate(`/admin/blog/${created.id}/edit`);
      } else if (post) {
        const updated = await adminBlogService.updatePost(post.id, payload);
        addToast("Post saved", "success");
        setPost(updated);
        const refreshed = await adminBlogService.getPost(post.id);
        setVersion(refreshed.version);
        setForm((prev) => {
          const next = {
            ...prev,
            contentMarkdown: refreshed.version.contentMarkdown ?? prev.contentMarkdown,
            contentHtml: refreshed.version.contentHtml ?? prev.contentHtml,
          };
          formRef.current = next;
          return next;
        });
        const versionsList = await adminBlogService.getVersions(post.id);
        setVersions(versionsList as BlogPostVersion[]);
      }
    } catch (saveError: any) {
      const message = saveError?.response?.data ?? "Failed to save post.";
      addToast(String(message), "error");
    }
  }, [addToast, adminBlogService, isNew, navigate, post]);

  useEffect(() => {
    setPageTitle(isNew ? "Create post" : "Edit post");
    setHeaderActions([
      {
        type: "button",
        id: "save-post",
        label: "Save changes",
        variant: "primary",
        onClick: () => handleSave("PUBLISHED" === statusDraft ? "PUBLISHED" : statusDraft),
      },
      {
        type: "button",
        id: "save-draft",
        label: "Save draft",
        variant: "outline",
        onClick: () => handleSave("DRAFT"),
      },
    ]);
    return () => setHeaderActions([]);
  }, [handleSave, isNew, setHeaderActions, setPageTitle, statusDraft]);

  useEffect(() => {
    if (!isNew) {
      fetchPost();
    }
  }, [id]);

  const handleArchive = async () => {
    if (!post) {
      return;
    }
    try {
      const updated = await adminBlogService.archivePost(post.id);
      setPost(updated);
      addToast("Post archived", "success");
    } catch (archiveError) {
      console.error(archiveError);
      addToast("Failed to archive post.", "error");
    } finally {
      setArchiveOpen(false);
    }
  };

  const handleSelectMedia = (asset: { id: string }) => {
    handleChange("coverAssetId", asset.id);
  };

  const handleVersionView = async (versionId: string) => {
    if (!post) {
      return;
    }
    const versionDetail = await adminBlogService.getVersion(post.id, versionId);
    setSelectedVersion(versionDetail);
    setVersionDrawerOpen(true);
  };

  const handleRestore = async (versionId: string) => {
    if (!post) {
      return;
    }
    try {
      const updated = await adminBlogService.restoreVersion(post.id, versionId, "Restored from history");
      setPost(updated);
      const refreshed = await adminBlogService.getPost(post.id);
      setVersion(refreshed.version);
      setForm((prev) => {
        const next = {
          ...prev,
          title: refreshed.post.title,
          slug: refreshed.post.slug,
          excerpt: refreshed.post.excerpt,
          contentMarkdown: refreshed.version.contentMarkdown ?? "",
          coverAssetId: refreshed.post.coverAssetId ?? "",
          tags: refreshed.post.tags,
          status: refreshed.post.status,
          scheduledAt: refreshed.post.scheduledAt ?? "",
          publishedAt: refreshed.post.publishedAt ?? "",
        };
        formRef.current = next;
        return next;
      });
      const restoredScheduledAt = refreshed.post.scheduledAt ?? "";
      const restoredPublishedAt = refreshed.post.publishedAt ?? "";
      scheduledAtRef.current = restoredScheduledAt;
      publishedAtRef.current = restoredPublishedAt;
      setScheduledAt(restoredScheduledAt);
      setPublishedAt(restoredPublishedAt);
      const versionsList = await adminBlogService.getVersions(post.id);
      setVersions(versionsList as BlogPostVersion[]);
      addToast("Version restored", "success");
    } catch (restoreError) {
      console.error(restoreError);
      addToast("Failed to restore version", "error");
    }
  };

  if (loading) {
    return (
      <div className="admin-grid">
        <Card>
          <div className="skeleton h-10" />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-grid">
        <EmptyState title="Unable to load post" description={error} />
      </div>
    );
  }

  return (
    <div className="admin-grid">
      <PageHeader
        title={isNew ? "Create post" : "Edit post"}
        description="Write, review, and publish blog content."
        breadcrumbs={["Admin", "Blog", isNew ? "New post" : "Edit post"]}
      />

      <Card>
        <h3>Basic info</h3>
        <label className="text-sm font-semibold">Title</label>
        <input
          type="text"
          className="w-full p-2 border rounded"
          value={form.title}
          onChange={(event) => {
            handleChange("title", event.target.value);
            if (isNew) {
              handleChange("slug", slugify(event.target.value));
            }
          }}
        />
        <p className="text-xs text-gray-500">Title should be 10–80 characters. {titleCount}/80</p>
        <label className="text-sm font-semibold">Slug</label>
        <input
          type="text"
          className="w-full p-2 border rounded"
          value={form.slug}
          onChange={(event) => handleChange("slug", event.target.value)}
        />
        <label className="text-sm font-semibold">Excerpt</label>
        <textarea
          className="w-full p-2 border rounded min-h-[120px]"
          value={form.excerpt}
          onChange={(event) => handleChange("excerpt", event.target.value)}
        />
        <p className="text-xs text-gray-500">Excerpt should be 160 characters or less. {excerptCount}/160</p>
        <label className="text-sm font-semibold">Tags</label>
        <input
          type="text"
          className="w-full p-2 border rounded"
          placeholder="rpg, updates, deals"
          value={tagsText}
          onChange={(event) =>
            handleChange(
              "tags",
              event.target.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
            )
          }
        />
        <p className="text-xs text-gray-500">Up to 8 tags, each 2–24 characters. {tagsCount}/8</p>
      </Card>

      <Card>
        <h3>Content</h3>
        <div className="flex gap-2 mb-3">
          <button className={`btn ${activeTab === "write" ? "btn-primary" : "btn-outline"}`} onClick={() => setActiveTab("write")}>
            Write
          </button>
          <button className={`btn ${activeTab === "preview" ? "btn-primary" : "btn-outline"}`} onClick={() => setActiveTab("preview")}>
            Preview
          </button>
        </div>
        {activeTab === "write" ? (
          <textarea
            className="w-full p-2 border rounded min-h-[240px]"
            value={form.contentMarkdown}
            onChange={(event) => handleChange("contentMarkdown", event.target.value)}
          />
        ) : (
          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        )}
      </Card>

      <Card>
        <h3>Cover</h3>
        <div className="flex items-center gap-3">
          <button className="btn btn-outline" onClick={() => setMediaPickerOpen(true)}>
            Select from media
          </button>
          {form.coverAssetId && <span className="text-xs text-gray-500">Selected media ID: {form.coverAssetId}</span>}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Use JPG/PNG/WebP up to 5MB. Minimum 1000×560px, recommended 1600×900px for best display.
        </p>
      </Card>

      <Card>
        <h3>Publishing</h3>
        <label className="text-sm font-semibold">Status</label>
        <select
          className="w-full p-2 border rounded"
          value={statusDraft}
          onChange={(event) => {
            const nextStatus = event.target.value as BlogStatus;
            setStatusDraft(nextStatus);
            handleChange("status", nextStatus);
          }}
        >
          {statusOptions.map((statusOption) => (
            <option key={statusOption} value={statusOption}>
              {statusOption}
            </option>
          ))}
        </select>
        {statusDraft === "SCHEDULED" && (
          <>
            <label className="text-sm font-semibold">Scheduled at</label>
            <input
              type="datetime-local"
              className="w-full p-2 border rounded"
              value={scheduledAt}
              onChange={(event) => handleScheduledAtChange(event.target.value)}
            />
          </>
        )}
        {statusDraft === "PUBLISHED" && (
          <>
            <label className="text-sm font-semibold">Published at</label>
            <input
              type="datetime-local"
              className="w-full p-2 border rounded"
              value={publishedAt}
              onChange={(event) => handlePublishedAtChange(event.target.value)}
            />
          </>
        )}
        <label className="text-sm font-semibold">Change note</label>
        <input
          type="text"
          className="w-full p-2 border rounded"
          value={changeNote}
          onChange={(event) => handleChangeNote(event.target.value)}
        />
        {!isNew && (
          <div className="mt-3">
            <button className="btn btn-outline" onClick={() => setArchiveOpen(true)}>
              Archive
            </button>
          </div>
        )}
      </Card>

      {!isNew && (
        <Card>
          <h3>Versions</h3>
          {versions.length === 0 ? (
            <EmptyState title="No versions yet" description="Save changes to create a new version." />
          ) : (
            <div className="space-y-2">
              {versions.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between border rounded p-3">
                  <div>
                    <p className="font-semibold">Version {entry.versionNumber}</p>
                    <p className="text-xs text-gray-500">{entry.createdAt}</p>
                    {entry.changeNote && <p className="text-xs text-gray-500">{entry.changeNote}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-outline" onClick={() => handleVersionView(entry.id)}>
                      View
                    </button>
                    <button className="btn btn-outline" onClick={() => handleRestore(entry.id)}>
                      Restore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <MediaPickerModal
        isOpen={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={handleSelectMedia}
        initialSelectedId={form.coverAssetId || undefined}
      />

      <Drawer isOpen={versionDrawerOpen} title="Version details" onClose={() => setVersionDrawerOpen(false)}>
        {selectedVersion ? (
          <div className="space-y-4">
            <Card>
              <p>
                <strong>Version:</strong> {selectedVersion.versionNumber}
              </p>
              <p>
                <strong>Created:</strong> {selectedVersion.createdAt}
              </p>
              <p>
                <strong>Note:</strong> {selectedVersion.changeNote ?? "—"}
              </p>
            </Card>
            <Card>
              <h3>Content preview</h3>
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedVersion.contentMarkdown ?? "") }}
              />
            </Card>
          </div>
        ) : (
          <EmptyState title="No version selected" description="Select a version to review." />
        )}
      </Drawer>

      <ModalConfirm
        isOpen={archiveOpen}
        title="Archive post?"
        description="This will remove the post from public listings."
        confirmLabel="Archive"
        onConfirm={handleArchive}
        onCancel={() => setArchiveOpen(false)}
      />
    </div>
  );
};

export default BlogPostEditorPage;
