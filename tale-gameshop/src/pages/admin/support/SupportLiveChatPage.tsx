import React, { useCallback, useEffect, useMemo, useState } from "react";
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

const SupportLiveChatPage: React.FC = () => {
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const [sessions, setSessions] = useState<ChatSessionListResponse["items"]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [filter, setFilter] = useState("needs_agent");
  const [query, setQuery] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [priority, setPriority] = useState("normal");
  const [tagDraft, setTagDraft] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPageTitle("Support / Live Chat");
    setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listChatSessions({ status: filter, q: query, page: 1, pageSize: 50 });
      setSessions(response.items);
    } finally {
      setLoading(false);
    }
  }, [filter, query]);

  const fetchSessionDetail = useCallback(async (sessionId: string) => {
    const detail = await getChatSessionAdmin(sessionId);
    setSelectedSession(detail.session);
    setMessages(detail.messages);
    setPriority(detail.session.priority);
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

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

  const sessionMeta = useMemo(() => {
    if (!selectedSession) {
      return null;
    }
    return {
      status: selectedSession.status,
      priority: selectedSession.priority,
      tags: selectedSession.tags,
    };
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
            <button className="btn btn-outline" type="button" onClick={fetchSessions} disabled={loading}>
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
                <span>Status: {sessionMeta?.status}</span>
                <span>Tags: {sessionMeta?.tags?.join(", ") || "—"}</span>
              </div>

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
            <div className="support-live-chat__empty">Select a session to view the conversation.</div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default SupportLiveChatPage;
