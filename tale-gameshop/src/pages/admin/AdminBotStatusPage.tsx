import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import { useToast } from "../../components/ui/ToastProvider";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IApiClient } from "../../iterfaces/i-api-client";

type BotWebhookStatus = {
  url: string;
  isSet: boolean;
  matchesConfig: boolean;
  pendingUpdateCount: number;
  lastErrorDate: string | null;
  lastErrorMessage: string | null;
};

type BotStatus = {
  botOk: boolean;
  botId?: number;
  botUsername?: string;
  botName?: string;
  error?: string;
  configuredWebhookUrl: string;
  secretConfigured: boolean;
  webhook?: BotWebhookStatus;
};

const StatusPill: React.FC<{ ok: boolean; okLabel: string; failLabel: string }> = ({ ok, okLabel, failLabel }) => (
  <span
    className={`px-2 py-1 rounded-full text-xs ${
      ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
    }`}
  >
    {ok ? okLabel : failLabel}
  </span>
);

const AdminBotStatusPage: React.FC = () => {
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const { addToast } = useToast();
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastSegment, setBroadcastSegment] = useState<"linked" | "all">("linked");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ total: number; sent: number; failed: number } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.get<BotStatus>("/api/admin/bot/status");
      setStatus(response.data);
    } catch (error) {
      console.error("Failed to load bot status", error);
      setStatus(null);
      addToast("Failed to load bot status.", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    setPageTitle("Bot status");
    setHeaderActions([]);
    return () => setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleBroadcast = async () => {
    const message = broadcastMessage.trim();
    if (!message) {
      addToast("Broadcast message is empty.", "error");
      return;
    }
    try {
      setBroadcastSending(true);
      setBroadcastResult(null);
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.post("/api/admin/bot/broadcast", {
        message,
        segment: broadcastSegment,
      });
      const result = response.data as { total: number; sent: number; failed: number };
      setBroadcastResult(result);
      setBroadcastMessage("");
      addToast(`Broadcast sent: ${result.sent}/${result.total}.`, "success");
    } catch (error: any) {
      console.error("Broadcast failed", error);
      const message2 = error?.response?.data ?? "Broadcast failed.";
      addToast(String(message2), "error");
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleApplyWebhook = async () => {
    try {
      setApplying(true);
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      await apiClient.api.post("/api/admin/bot/webhook");
      addToast("Webhook applied.", "success");
      await loadStatus();
    } catch (error: any) {
      console.error("Failed to apply webhook", error);
      const message = error?.response?.data ?? "Failed to apply webhook.";
      addToast(String(message), "error");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="admin-grid">
      <PageHeader
        title="Bot status"
        description="Telegram bot health: identity, webhook state, and quick actions."
        breadcrumbs={["Bot", "Status"]}
        primaryAction={
          <button className="btn btn-outline" onClick={loadStatus} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      {loading && !status && (
        <Card>
          <div className="space-y-3">
            <div className="skeleton h-10" />
            <div className="skeleton h-10" />
          </div>
        </Card>
      )}

      {!loading && !status && (
        <EmptyState
          title="Status unavailable"
          description="Could not reach the backend for bot status."
          action={
            <button className="btn btn-primary" onClick={loadStatus}>
              Retry
            </button>
          }
        />
      )}

      {status && (
        <>
          <Card>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Bot</h3>
                {status.botOk ? (
                  <p className="text-sm text-slate-600 mt-1">
                    @{status.botUsername} · {status.botName} · ID {status.botId}
                  </p>
                ) : (
                  <p className="text-sm text-slate-600 mt-1">
                    {status.error || "Bot token is missing or invalid."}
                  </p>
                )}
              </div>
              <StatusPill ok={status.botOk} okLabel="Connected" failLabel="Unavailable" />
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <h3 className="text-sm font-semibold text-slate-800">Webhook</h3>
                {status.webhook && (
                  <StatusPill
                    ok={status.webhook.isSet && status.webhook.matchesConfig}
                    okLabel="Active"
                    failLabel={status.webhook?.isSet ? "URL mismatch" : "Not set"}
                  />
                )}
              </div>

              <div className="text-sm text-slate-600 space-y-1">
                <p>
                  <span className="text-slate-400">Configured URL:</span>{" "}
                  {status.configuredWebhookUrl || "—"}
                </p>
                {status.webhook && (
                  <>
                    <p>
                      <span className="text-slate-400">Registered in Telegram:</span>{" "}
                      {status.webhook.url || "—"}
                    </p>
                    <p>
                      <span className="text-slate-400">Pending updates:</span>{" "}
                      {status.webhook.pendingUpdateCount}
                    </p>
                    {status.webhook.lastErrorMessage && (
                      <p className="text-red-600">
                        Last error: {status.webhook.lastErrorMessage}
                        {status.webhook.lastErrorDate
                          ? ` (${new Date(status.webhook.lastErrorDate).toLocaleString()})`
                          : ""}
                      </p>
                    )}
                  </>
                )}
                <p>
                  <span className="text-slate-400">Secret token:</span>{" "}
                  {status.secretConfigured ? "configured" : "not configured (dev only)"}
                </p>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  className="btn btn-primary"
                  onClick={handleApplyWebhook}
                  disabled={applying || !status.botOk}
                >
                  {applying ? "Applying..." : "Apply webhook"}
                </button>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-slate-800">Broadcast</h3>
              <p className="text-sm text-slate-600">
                Send a message to bot users. HTML formatting is supported (&lt;b&gt;, &lt;a&gt;, &lt;code&gt;).
              </p>
              <textarea
                className="w-full border border-gray-200 rounded-md px-3 py-2 min-h-[100px]"
                placeholder="Message text..."
                value={broadcastMessage}
                onChange={(event) => setBroadcastMessage(event.target.value)}
                maxLength={4000}
              />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <select
                  className="p-2 border rounded"
                  value={broadcastSegment}
                  onChange={(event) => setBroadcastSegment(event.target.value as "linked" | "all")}
                >
                  <option value="linked">Linked accounts only</option>
                  <option value="all">Everyone who started the bot</option>
                </select>
                <button
                  className="btn btn-primary"
                  onClick={handleBroadcast}
                  disabled={broadcastSending || !status.botOk || !broadcastMessage.trim()}
                >
                  {broadcastSending ? "Sending..." : "Send broadcast"}
                </button>
              </div>
              {broadcastResult && (
                <p className="text-sm text-slate-600">
                  Delivered {broadcastResult.sent} of {broadcastResult.total}
                  {broadcastResult.failed > 0 ? `, failed ${broadcastResult.failed} (blocked the bot, etc.)` : ""}.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-800">Content</h3>
            <p className="text-sm text-slate-600 mt-1">
              Bot texts and keyboard keys are stored in the database and editable from the admin.
            </p>
            <div className="mt-3">
              <Link className="btn btn-outline" to="/admin/botChanger">
                Edit bot texts
              </Link>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default AdminBotStatusPage;
