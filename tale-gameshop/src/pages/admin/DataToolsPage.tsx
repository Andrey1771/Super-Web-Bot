import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import Card from "../../components/ui/Card";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IApiClient } from "../../iterfaces/i-api-client";
import type { ImportJob } from "../../types/data-tools";
import { useToast } from "../../components/ui/ToastProvider";

type ImportMode = "create-only" | "update-existing" | "create+update";
type MediaStrategy = "missing-only" | "replace";

const DataToolsPage: React.FC = () => {
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [mode, setMode] = useState<ImportMode>("create+update");
  const [mediaStrategy, setMediaStrategy] = useState<MediaStrategy>("missing-only");
  const [includeHistory, setIncludeHistory] = useState(true);
  const [includeMedia, setIncludeMedia] = useState(true);
  const [exportIncludeHistory, setExportIncludeHistory] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<ImportJob | null>(null);
  const [imports, setImports] = useState<ImportJob[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);

  useEffect(() => {
    setPageTitle("Import / Export");
    setHeaderActions([]);
    loadImports();
  }, [setHeaderActions, setPageTitle]);

  const loadImports = async () => {
    try {
      const response = await apiClient.api.get("/api/admin/data-tools/imports?limit=10");
      setImports(response.data as ImportJob[]);
    } catch (error) {
      console.error(error);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const nextFile = event.dataTransfer.files?.[0] ?? null;
    setFile(nextFile);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const downloadFile = async (url: string, filename: string) => {
    const response = await apiClient.api.get(url, { responseType: "blob" });
    const blobUrl = window.URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(blobUrl);
  };

  const handleTemplateDownload = async () => {
    try {
      await downloadFile("/api/admin/data-tools/template", "template.zip");
    } catch (error) {
      addToast({ title: "Download failed", message: "Unable to download template.", tone: "error" });
    }
  };

  const handleExport = async () => {
    try {
      const query = new URLSearchParams({
        includeMedia: includeMedia ? "true" : "false",
        includeHistory: exportIncludeHistory ? "true" : "false",
      });
      await downloadFile(`/api/admin/data-tools/export?${query.toString()}`, "export.zip");
    } catch (error) {
      addToast({ title: "Export failed", message: "Unable to export data.", tone: "error" });
    }
  };

  const uploadPackage = async (applyChanges: boolean) => {
    if (!file) {
      addToast({ title: "No file selected", message: "Please choose a ZIP package.", tone: "warning" });
      return;
    }

    setImporting(true);
    setProgress(0);
    setReport(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "params",
      JSON.stringify({
        dryRun: !applyChanges,
        mode,
        includeHistory,
        mediaStrategy,
      })
    );

    try {
      const response = await apiClient.api.post("/api/admin/data-tools/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (event.total) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      });
      setReport(response.data as ImportJob);
      await loadImports();
      addToast({
        title: applyChanges ? "Import completed" : "Validation completed",
        message: "Check the report for details.",
        tone: "success",
      });
    } catch (error: any) {
      if (error?.response?.data) {
        setReport(error.response.data as ImportJob);
      }
      addToast({ title: "Import failed", message: "Please review the errors in the report.", tone: "error" });
    } finally {
      setImporting(false);
      setProgress(0);
    }
  };

  const loadImportDetails = useCallback(
    async (id: string) => {
      setDetailsLoading(true);
      setSelectedImportId(id);
      try {
        const response = await apiClient.api.get(`/api/admin/data-tools/import/${id}`);
        setReport(response.data as ImportJob);
      } catch (error) {
        console.error(error);
      } finally {
        setDetailsLoading(false);
      }
    },
    [apiClient]
  );

  const summary = useMemo(() => {
    if (!report) {
      return null;
    }
    const stats = report.stats;
    return [
      { label: "Games created", value: stats?.gamesCreated ?? 0 },
      { label: "Games updated", value: stats?.gamesUpdated ?? 0 },
      { label: "Games skipped", value: stats?.gamesSkipped ?? 0 },
      { label: "Blog created", value: stats?.blogCreated ?? 0 },
      { label: "Blog updated", value: stats?.blogUpdated ?? 0 },
      { label: "Blog skipped", value: stats?.blogSkipped ?? 0 },
      { label: "Media created", value: stats?.mediaCreated ?? 0 },
      { label: "Media skipped", value: stats?.mediaSkipped ?? 0 },
    ];
  }, [report]);

  return (
    <div className="admin-grid">
      <PageHeader
        title="Import / Export"
        description="Import or export a single ZIP package with games, media, and blog content."
        breadcrumbs={["System", "Import / Export"]}
      />

      <div className="admin-grid admin-grid--2">
        <Card>
          <h3>Download template</h3>
          <p className="text-sm text-gray-500">
            Download a ready-to-fill ZIP with JSON templates and media folder structure.
          </p>
          <button className="admin-button" onClick={handleTemplateDownload}>
            Download template
          </button>
        </Card>

        <Card>
          <h3>Export current data</h3>
          <p className="text-sm text-gray-500">Generate a backup package in the same format.</p>
          <div className="data-tools__options">
            <label className="data-tools__option data-tools__option--row">
              <input
                type="checkbox"
                checked={includeMedia}
                onChange={(event) => setIncludeMedia(event.target.checked)}
              />
              Include media
            </label>
            <label className="data-tools__option data-tools__option--row">
              <input
                type="checkbox"
                checked={exportIncludeHistory}
                onChange={(event) => setExportIncludeHistory(event.target.checked)}
              />
              Include blog history
            </label>
          </div>
          <button className="admin-button" onClick={handleExport}>
            Export current data
          </button>
        </Card>
      </div>

      <Card>
        <h3>Import package</h3>
        <p className="text-sm text-gray-500">
          Upload a single ZIP containing package.json, data JSON files, and media folder.
        </p>
        <div
          className={`data-tools__dropzone ${isDragging ? "is-dragging" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept=".zip" onChange={handleFileChange} />
          <div>
            <strong>{file ? file.name : "Drag & drop ZIP here"}</strong>
            <div className="text-sm text-gray-500">or click to select a file</div>
          </div>
        </div>

        <div className="data-tools__options">
          <label className="data-tools__option data-tools__option--row">
            <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} />
            Dry run (validate only)
          </label>
          <label className="data-tools__option data-tools__option--row">
            <input
              type="checkbox"
              checked={includeHistory}
              onChange={(event) => setIncludeHistory(event.target.checked)}
            />
            Import blog versions/history
          </label>
        </div>

        <div className="data-tools__options">
          <label className="data-tools__option">
            Upsert mode
            <select value={mode} onChange={(event) => setMode(event.target.value as ImportMode)}>
              <option value="create-only">Create only</option>
              <option value="update-existing">Update existing</option>
              <option value="create+update">Create + Update</option>
            </select>
          </label>
          <label className="data-tools__option">
            Media strategy
            <select value={mediaStrategy} onChange={(event) => setMediaStrategy(event.target.value as MediaStrategy)}>
              <option value="missing-only">Upload missing only</option>
              <option value="replace">Replace duplicates</option>
            </select>
          </label>
        </div>

        {importing && (
          <div className="data-tools__progress">
            <div className="data-tools__progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="data-tools__actions">
          <button
            className={`admin-button ${dryRun ? "admin-button--primary" : ""}`}
            onClick={() => uploadPackage(false)}
            disabled={importing}
          >
            Validate
          </button>
          <button
            className={`admin-button ${dryRun ? "" : "admin-button--primary"}`}
            onClick={() => uploadPackage(true)}
            disabled={importing}
          >
            Import
          </button>
        </div>
      </Card>

      <Card>
        <h3>Import report</h3>
        {!report && <p className="text-sm text-gray-500">Upload a package to view validation and import results.</p>}
        {report && (
          <>
            <div className="data-tools__summary">
              <div>
                <strong>Status:</strong> {report.status}
              </div>
              <div>
                <strong>Dry run:</strong> {report.dryRun ? "Yes" : "No"}
              </div>
              <div>
                <strong>Started:</strong> {new Date(report.startedAt).toLocaleString()}
              </div>
            </div>

            {summary && (
              <div className="data-tools__summary-grid">
                {summary.map((item) => (
                  <div key={item.label} className="data-tools__summary-card">
                    <div className="text-sm text-gray-500">{item.label}</div>
                    <div className="data-tools__summary-value">{item.value}</div>
                  </div>
                ))}
              </div>
            )}

            {(report.errors?.length ?? 0) > 0 && (
              <div className="data-tools__issues">
                <h4>Errors</h4>
                <ul>
                  {report.errors.map((issue, index) => (
                    <li key={`${issue.code}-${index}`}>
                      <strong>{issue.path}</strong>: {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(report.warnings?.length ?? 0) > 0 && (
              <div className="data-tools__issues data-tools__issues--warning">
                <h4>Warnings</h4>
                <ul>
                  {report.warnings.map((issue, index) => (
                    <li key={`${issue.code}-${index}`}>
                      <strong>{issue.path}</strong>: {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Card>

      <Card>
        <h3>Recent imports</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>Status</th>
              <th>Games</th>
              <th>Blog</th>
              <th>Media</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {imports.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.startedAt).toLocaleString()}</td>
                <td>{item.userName}</td>
                <td>{item.status}</td>
                <td>
                  {item.stats?.gamesCreated ?? 0}/{item.stats?.gamesUpdated ?? 0}
                </td>
                <td>
                  {item.stats?.blogCreated ?? 0}/{item.stats?.blogUpdated ?? 0}
                </td>
                <td>
                  {item.stats?.mediaCreated ?? 0}/{item.stats?.mediaSkipped ?? 0}
                </td>
                <td>
                  <button
                    className="admin-button admin-button--ghost"
                    onClick={() => loadImportDetails(item.id)}
                    disabled={detailsLoading && selectedImportId === item.id}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
            {imports.length === 0 && (
              <tr>
                <td colSpan={7} className="admin-table__cell-muted">
                  No imports yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default DataToolsPage;
