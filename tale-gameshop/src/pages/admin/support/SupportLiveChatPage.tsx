import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../../../components/layout/PageHeader";
import Card from "../../../components/ui/Card";
import {
  assignChatSession,
  getChatSessionAdmin,
  getOlderChatMessagesAdmin,
  listChatSessions,
  sendAgentMessage,
  updateChatSession,
} from "../../../api/supportChatApi";
import type { ChatMessage, ChatSessionListResponse, ChatSession } from "../../../types/support-chat";
import { formatSessionCode } from "../../../utils/support-session-code";
import "./support-live-chat.css";
import { useAdminHeader } from "../../../components/layout/AdminHeaderContext";

const statusFilters = ["ai", "needs_agent", "assigned", "closed", "open"];

// Открытый диалог опрашивается чаще (2.5 с) — там важна каждая реплика. Список обновляем
// реже: он нужен, чтобы заметить новое обращение, а не чтобы читать переписку.
const LIST_REFRESH_MS = 10000;

// Размер страницы переписки. Совпадает с messageLimit, с которым открывается диалог: по нему
// же решается, есть ли что подгружать выше — ответ короче страницы означает начало разговора.
const HISTORY_PAGE = 100;

// На каком расстоянии от верха ленты запрашивается следующая страница.
const HISTORY_TRIGGER_PX = 120;

// Опрос диалога приносит только хвост переписки. Заменять им состояние нельзя: подгруженные
// вверх страницы пропадали бы каждые 2.5 секунды. Свежая копия реплики перетирает старую —
// у сообщения меняется оценка 👍/👎, и в ленте должна оказаться последняя версия.
const mergeAdminMessages = (prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const byId = new Map(prev.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  // Array.from, а не спред: цель сборки ниже es2015, и итератор Map спредом не разворачивается.
  return Array.from(byId.values()).sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
};

// Самая ранняя загруженная реплика — от неё отсчитывается следующая страница вверх.
const oldestMoment = (list: ChatMessage[]): string | undefined =>
  list.reduce<string | undefined>((oldest, message) => {
    const moment = new Date(message.createdAt).getTime();
    if (Number.isNaN(moment)) {
      return oldest;
    }
    return !oldest || moment < new Date(oldest).getTime() ? message.createdAt : oldest;
  }, undefined);

// Второй признак, по которому строки списка различаются: у гостей имя всегда одно и то же,
// а время последней реплики — разное. Сегодняшние показываем часами, старые — датой.
const formatListTime = (value?: string): string => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "2-digit", month: "short" });
};

// «Был в сети» и «когда писал» специалисту нужны относительно текущего момента: решение
// «ждать ответа или закрывать» принимается по «пять минут назад», а не по «14:03».
const formatAgo = (value?: string): string => {
  if (!value) {
    return "";
  }
  const moment = new Date(value).getTime();
  if (Number.isNaN(moment)) {
    return "";
  }
  const minutes = Math.floor(Math.max(0, Date.now() - moment) / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
};

const formatExact = (value?: string): string | undefined =>
  value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString() : undefined;

// Состояние присутствия приходит с сервера уже посчитанным — здесь только подпись к нему.
const presenceLabel = (session: ChatSession): string => {
  switch (session.presence) {
    case "viewing":
      return "viewing the chat";
    case "online":
      return "on the site, chat minimised";
    case "away":
      return session.lastSeenAt ? `last seen ${formatAgo(session.lastSeenAt)}` : "away";
    default:
      return "—";
  }
};

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

  // Прокрутка переписки вверх. Флаги дублируются в ref: загрузку запускает обработчик
  // прокрутки, а он видит состояние на момент последней отрисовки — без ref одно движение
  // колеса успевало отправить несколько одинаковых запросов.
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const hasMoreHistoryRef = useRef(false);
  const loadingHistoryRef = useRef(false);
  useEffect(() => {
    hasMoreHistoryRef.current = hasMoreHistory;
  }, [hasMoreHistory]);
  useEffect(() => {
    loadingHistoryRef.current = loadingHistory;
  }, [loadingHistory]);

  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const messagesBoxRef = useRef<HTMLDivElement | null>(null);
  // Расстояние от низа ленты на момент запроса страницы: дописанные сверху реплики сдвигают
  // содержимое вниз ровно на свою высоту, и без поправки специалиста выбрасывало бы в начало.
  const historyAnchorRef = useRef<{ fromBottom: number; firstId?: string } | null>(null);

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
    // Открытие другого диалога — переписку заменяем целиком, а не подмешиваем: истории
    // предыдущего в ленте быть не должно.
    setMessages(detail.messages);
    setPriority(detail.session.priority);
    setLoadError(null);
    // Пришла ровно страница — выше может быть ещё. Точный ответ даст первая же подгрузка.
    setHasMoreHistory(detail.messages.length >= HISTORY_PAGE);
    historyAnchorRef.current = null;
  }, []);

  /** Следующая страница переписки вверх. Дописывается в начало, порядок держит слияние. */
  const loadOlderMessages = useCallback(async (sessionId: string) => {
    if (loadingHistoryRef.current || !hasMoreHistoryRef.current) {
      return;
    }

    const before = oldestMoment(messagesRef.current);
    if (!before) {
      setHasMoreHistory(false);
      return;
    }

    loadingHistoryRef.current = true;
    setLoadingHistory(true);
    try {
      const older = await getOlderChatMessagesAdmin(sessionId, before, HISTORY_PAGE);
      if (older.length < HISTORY_PAGE) {
        setHasMoreHistory(false);
      }
      if (older.length > 0) {
        setMessages((prev) => mergeAdminMessages(prev, older));
      }
    } catch (err) {
      console.error(err);
    } finally {
      loadingHistoryRef.current = false;
      setLoadingHistory(false);
    }
  }, []);

  const handleMessagesScroll = () => {
    const box = messagesBoxRef.current;
    if (!box || !selectedSession) {
      return;
    }
    if (box.scrollTop < HISTORY_TRIGGER_PX && hasMoreHistory && !loadingHistory) {
      historyAnchorRef.current = {
        fromBottom: box.scrollHeight - box.scrollTop,
        firstId: messages[0]?.id
      };
      loadOlderMessages(selectedSession.id);
    }
  };

  // Позицию возвращаем до отрисовки кадра — иначе лента успевает мигнуть прыжком. Сверяемся
  // по первой реплике: пока страница едет, снизу может прийти новая, и двигать прокрутку
  // на неё нельзя — специалист стоит на своём месте в переписке.
  useLayoutEffect(() => {
    const box = messagesBoxRef.current;
    const anchor = historyAnchorRef.current;
    if (!box || !anchor) {
      return;
    }
    if (messages[0]?.id !== anchor.firstId) {
      box.scrollTop = box.scrollHeight - anchor.fromBottom;
      historyAnchorRef.current = null;
      return;
    }
    if (!loadingHistory) {
      historyAnchorRef.current = null;
    }
  }, [messages, loadingHistory]);

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
      // Опрос приносит только хвост переписки — подмешиваем его к тому, что уже загружено,
      // иначе подгруженные вверх страницы стирались бы каждые 2.5 секунды.
      setMessages((prev) => mergeAdminMessages(prev, detail.messages));
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
              placeholder="Search by email, user id or #code"
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
                  <div className="support-live-chat__who">
                    <strong>{session.email ?? session.userId ?? "Guest"}</strong>
                    <span className="support-live-chat__code">{formatSessionCode(session.id)}</span>
                  </div>
                  <div className="support-live-chat__muted">{session.lastMessagePreview ?? "No messages yet"}</div>
                </div>
                <div className="support-live-chat__meta">
                  <span className={`tag tag--${session.priority}`}>{session.priority}</span>
                  <span>{session.status}</span>
                  {formatListTime(session.lastMessageAt) && <span>{formatListTime(session.lastMessageAt)}</span>}
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
                  <div className="support-live-chat__who">
                    <strong>{selectedSession.email ?? selectedSession.userId ?? "Guest"}</strong>
                    <span className="support-live-chat__code">{formatSessionCode(selectedSession.id)}</span>
                  </div>
                  {/* Полный идентификатор оставлен рядом: код — для разговора с клиентом,
                      ссылки и обращения в поддержку самой админки идут по нему. */}
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
                <span className="support-live-chat__presence">
                  Customer:
                  <span
                    className={`support-live-chat__dot support-live-chat__dot--${selectedSession.presence ?? "unknown"}`}
                    aria-hidden="true"
                  />
                  {presenceLabel(selectedSession)}
                </span>
                <span title={formatExact(selectedSession.lastCustomerMessageAt)}>
                  Wrote last: {formatAgo(selectedSession.lastCustomerMessageAt) || "—"}
                </span>
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

              <div className="support-live-chat__messages" ref={messagesBoxRef} onScroll={handleMessagesScroll}>
                {loadingHistory && (
                  <div className="support-live-chat__history-loading" role="status">
                    Loading earlier messages…
                  </div>
                )}
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
