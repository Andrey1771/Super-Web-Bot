import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../../../components/layout/PageHeader";
import Card from "../../../components/ui/Card";
import {
  assignChatSession,
  getChatSessionAdmin,
  listChatSessions,
  sendAgentMessage,
  updateChatSession,
} from "../../../api/supportChatApi";
import type { ChatMessage, ChatSessionListResponse, ChatSession } from "../../../types/support-chat";
import "./support-live-chat.css";
import { useAdminHeader } from "../../../components/layout/AdminHeaderContext";

const statusFilters = ["ai", "needs_agent", "assigned", "closed", "open"];

// Открытый диалог опрашивается чаще (2.5 с) — там важна каждая реплика. Список обновляем
// реже: он нужен, чтобы заметить новое обращение, а не чтобы читать переписку.
const LIST_REFRESH_MS = 10000;

const SupportLiveChatPage: React.FC = () => {
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState<ChatSessionListResponse["items"]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [filter, setFilter] = useState("needs_agent");
  const [query, setQuery] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [priority, setPriority] = useState("normal");
  const [tagDraft, setTagDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setPageTitle("Support / Live Chat");
    setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

  // silent — для фонового обновления: индикатор загрузки при нём не мигает.
  const fetchSessions = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const response = await listChatSessions({ status: filter, q: query, page: 1, pageSize: 50 });
      setSessions(response.items);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [filter, query]);

  const fetchSessionDetail = useCallback(async (sessionId: string) => {
    const detail = await getChatSessionAdmin(sessionId);
    setSelectedSession(detail.session);
    setMessages(detail.messages);
    setPriority(detail.session.priority);
    setLoadError(null);
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Новое обращение попадает в список само: раньше специалист мог сидеть на этой странице
  // и не увидеть его, пока не нажмёт Refresh.
  useEffect(() => {
    const interval = window.setInterval(() => fetchSessions(true), LIST_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [fetchSessions]);

  // Ссылка из уведомления об эскалации ведёт сюда с ?session=<id> — открываем этот диалог
  // сразу, не заставляя искать его в списке. Дальше параметр не нужен: выбор ведёт состояние.
  useEffect(() => {
    const requested = searchParams.get("session");
    if (!requested) {
      return;
    }
    fetchSessionDetail(requested)
      .catch(() => setLoadError(`Session ${requested} was not found.`))
      .finally(() => {
        searchParams.delete("session");
        setSearchParams(searchParams, { replace: true });
      });
  }, [fetchSessionDetail, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedSession) {
      return;
    }
    const interval = window.setInterval(async () => {
      const detail = await getChatSessionAdmin(selectedSession.id);
      setSelectedSession(detail.session);
      setMessages(detail.messages);
    }, 2500);
    return () => window.clearInterval(interval);
  }, [selectedSession]);

  const handleAssign = async () => {
    if (!selectedSession) {
      return;
    }
    const updated = await assignChatSession(selectedSession.id);
    setSelectedSession(updated);
    await fetchSessions();
  };

  const handleClose = async () => {
    if (!selectedSession) {
      return;
    }
    const updated = await updateChatSession(selectedSession.id, { status: "closed" });
    setSelectedSession(updated);
    await fetchSessions();
  };

  const handleSend = async () => {
    if (!selectedSession || !messageDraft.trim()) {
      return;
    }
    const message = await sendAgentMessage(selectedSession.id, messageDraft.trim());
    setMessages((prev) => [...prev, message]);
    setMessageDraft("");
    await fetchSessions();
  };

  const handlePriorityChange = async (value: string) => {
    if (!selectedSession) {
      return;
    }
    const updated = await updateChatSession(selectedSession.id, { priority: value });
    setSelectedSession(updated);
    setPriority(value);
    await fetchSessions();
  };

  const handleTagAdd = async () => {
    if (!selectedSession || !tagDraft.trim()) {
      return;
    }
    const updated = await updateChatSession(selectedSession.id, { tag: tagDraft.trim() });
    setSelectedSession(updated);
    setTagDraft("");
    await fetchSessions();
  };

  // Почему диалог оказался у специалиста: причина, категория и стенограмма, которые ушли
  // в уведомление. Раньше это было только в письме, а на рабочем экране их не было.
  const handoffContext = useMemo(() => {
    if (!selectedSession) {
      return null;
    }
    const { escalationReason, category, summary } = selectedSession;
    if (!escalationReason && !category && !summary) {
      return null;
    }
    return { escalationReason, category, summary };
  }, [selectedSession]);

  return (
    <div className="support-live-chat">
      <PageHeader
        title="Support / Live Chat"
        description="Monitor AI escalations, assign agents, and reply in real time."
        breadcrumbs={["Admin", "Support", "Live chat"]}
      />

      <div className="support-live-chat__grid">
        <Card>
          <div className="support-live-chat__filters">
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              {statusFilters.map((status) => (
                <option key={status} value={status}>
                  {status.replace("_", " ").toUpperCase()}
                </option>
              ))}
            </select>
            <input
              type="search"
              placeholder="Search by email or user id"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="btn btn-outline" type="button" onClick={() => fetchSessions()} disabled={loading}>
              Refresh
            </button>
          </div>

          <div className="support-live-chat__list">
            {sessions.map((session) => (
              <button
                key={session.id}
                className={`support-live-chat__item ${
                  selectedSession?.id === session.id ? "active" : ""
                }`}
                type="button"
                onClick={() => fetchSessionDetail(session.id)}
              >
                <div>
                  <strong>{session.email ?? session.userId ?? "Guest"}</strong>
                  <div className="support-live-chat__muted">{session.lastMessagePreview ?? "No messages yet"}</div>
                </div>
                <div className="support-live-chat__meta">
                  <span className={`tag tag--${session.priority}`}>{session.priority}</span>
                  <span>{session.status}</span>
                </div>
              </button>
            ))}
            {sessions.length === 0 && <div className="support-live-chat__empty">No chat sessions found.</div>}
          </div>
        </Card>

        <Card>
          {selectedSession ? (
            <div className="support-live-chat__detail">
              <div className="support-live-chat__detail-header">
                <div>
                  <strong>{selectedSession.email ?? "Guest"}</strong>
                  <div className="support-live-chat__muted">Session {selectedSession.id}</div>
                </div>
                <div className="support-live-chat__actions">
                  <button className="btn btn-primary" type="button" onClick={handleAssign}>
                    Assign to me
                  </button>
                  <button className="btn btn-outline" type="button" onClick={handleClose}>
                    Close
                  </button>
                  <select value={priority} onChange={(event) => handlePriorityChange(event.target.value)}>
                    <option value="low">Low priority</option>
                    <option value="normal">Normal priority</option>
                    <option value="high">High priority</option>
                  </select>
                </div>
              </div>

              <div className="support-live-chat__meta-row">
                <span>Status: {selectedSession.status}</span>
                <span>Language: {selectedSession.language ?? "—"}</span>
                <span>Order: {selectedSession.orderId ?? "—"}</span>
                <span>Tags: {selectedSession.tags?.join(", ") || "—"}</span>
              </div>

              {handoffContext && (
                <div className="support-live-chat__handoff">
                  <div className="support-live-chat__handoff-head">
                    <strong>Why this reached a specialist</strong>
                    {handoffContext.category && <span className="tag">{handoffContext.category}</span>}
                  </div>
                  {handoffContext.escalationReason && <p>{handoffContext.escalationReason}</p>}
                  {handoffContext.summary && (
                    <details open>
                      <summary>Conversation summary (as sent in the alert)</summary>
                      <pre>{handoffContext.summary}</pre>
                    </details>
                  )}
                </div>
              )}

              <div className="support-live-chat__messages">
                {messages.map((message) => (
                  <div key={message.id} className={`support-live-chat__bubble support-live-chat__bubble--${message.role}`}>
                    <div className="support-live-chat__bubble-author">{message.authorName}</div>
                    <p>{message.text}</p>
                  </div>
                ))}
              </div>

              <div className="support-live-chat__reply">
                <input
                  type="text"
                  placeholder="Type your reply as an agent..."
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                />
                <button className="btn btn-primary" type="button" onClick={handleSend}>
                  Send
                </button>
              </div>

              <div className="support-live-chat__tags">
                <input
                  type="text"
                  placeholder="Add tag (payment, refund, account...)"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                />
                <button className="btn btn-outline" type="button" onClick={handleTagAdd}>
                  Add tag
                </button>
              </div>
            </div>
          ) : (
            <div className="support-live-chat__empty">
              {loadError ?? "Select a session to view the conversation."}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default SupportLiveChatPage;
