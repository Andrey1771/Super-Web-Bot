import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatLauncherButton from "./ChatLauncherButton";
import ChatWindow from "./ChatWindow";
import "./support-chat.css";
import type { ChatFeedback, ChatMessage, ChatSession } from "../../types/support-chat";
import {
  createChatSession,
  fetchChatConfig,
  getChatMessages,
  getChatSession,
  sendChatMessage,
  sendMessageFeedback,
  streamChatMessage,
  updateChatContact,
} from "../../api/supportChatApi";
import { detectSupportLang, getSupportDict } from "./i18n";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IKeycloakService } from "../../iterfaces/i-keycloak-service";

const SESSION_KEY = "tale_support_chat_session";
const HISTORY_KEY = "tale_support_chat_history";

// Сообщения, нарисованные до ответа сервера: у них временный id и время по часам браузера.
const isLocalId = (id: string) => id.startsWith("local-") || id.startsWith("stream-");

// Курсор опроса берём только по подтверждённым сервером сообщениям: часы браузера и сервера
// расходятся, и время оптимистичной заглушки может «перепрыгнуть» ответ специалиста.
const lastServerTimestamp = (list: ChatMessage[]): string | undefined => {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (!isLocalId(list[index].id)) {
      return list[index].createdAt;
    }
  }
  return undefined;
};

// Склейка по id, а не по времени: иначе своё же сообщение приходило вторым экземпляром.
const mergeMessages = (prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const known = new Set(prev.map((message) => message.id));
  const fresh = incoming.filter((message) => !known.has(message.id));
  if (fresh.length === 0) {
    return prev;
  }

  // Пришла серверная копия — временная заглушка с тем же текстом больше не нужна.
  const kept = prev.filter(
    (message) =>
      !isLocalId(message.id) ||
      !fresh.some((item) => item.role === message.role && item.text.trim() === message.text.trim())
  );

  return [...kept, ...fresh];
};

const responseStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | undefined)?.response?.status;

const ChatWidget: React.FC = () => {
  const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [session, setSession] = useState<ChatSession | undefined>();
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY) ?? "");
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | undefined>();
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const [contactForm, setContactForm] = useState({ email: "", orderId: "", sent: false });
  const [lastUserMessage, setLastUserMessage] = useState<string>("");
  // Специалист закрыл диалог: переписку оставляем на экране, но писать в неё уже нельзя.
  const [isClosed, setIsClosed] = useState(false);

  const lang = useMemo(detectSupportLang, []);
  const dict = useMemo(() => getSupportDict(lang), [lang]);

  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const isAuthenticated = Boolean(keycloakService.keycloak?.authenticated);

  // Внешние страницы (например, карточка «Live chat» на /support) могут открыть виджет этим событием.
  useEffect(() => {
    const openChat = () => {
      setIsOpen(true);
      setUnreadCount(0);
    };
    window.addEventListener('taleshop:open-support-chat', openChat);
    return () => window.removeEventListener('taleshop:open-support-chat', openChat);
  }, []);

  const persistMessages = (nextMessages: ChatMessage[]) => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(nextMessages.slice(-50)));
  };

  const syncUnread = useCallback(
    (incoming: ChatMessage[]) => {
      // Свои же сообщения, вернувшиеся с сервера, непрочитанными не считаем.
      const fromSupport = incoming.filter((message) => message.role !== "user");
      if (!isOpen && fromSupport.length > 0) {
        setUnreadCount((prev) => prev + fromSupport.length);
      }
    },
    [isOpen]
  );

  // Signed-in users: quietly attach their account email to the session (no upfront form).
  const authedEmail = isAuthenticated
    ? (keycloakService.keycloak?.tokenParsed as { email?: string } | undefined)?.email
    : undefined;

  // Сессии больше нет на сервере — начинаем с чистого листа, иначе виджет
  // навсегда упирался бы в ошибку на каждой отправке.
  const startNewChat = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(HISTORY_KEY);
    setSessionId("");
    setSession(undefined);
    setMessages([]);
    setContactForm({ email: "", orderId: "", sent: false });
    setTurnstileToken(undefined);
    setIsClosed(false);
    setError(null);
    setIsTyping(false);
  }, []);

  // 409 — диалог закрыт специалистом: переписку показываем, писать не даём.
  // 404 — сессии нет вовсе (например, чистили базу): молча начинаем новую.
  const handleSessionGone = useCallback(
    (error: unknown): boolean => {
      const status = responseStatus(error);
      if (status === 409 || status === 410) {
        setIsClosed(true);
        setIsTyping(false);
        return true;
      }
      if (status === 404) {
        startNewChat();
        return true;
      }
      return false;
    },
    [startNewChat]
  );

  const loadSession = useCallback(
    async (sessionId: string) => {
      try {
        const data = await getChatSession(sessionId);
        setSession(data.session);
        setIsClosed(data.session?.status === "closed");
        const safeMessages = Array.isArray(data.messages) ? data.messages : [];
        setMessages(safeMessages);
        persistMessages(safeMessages);
      } catch (err) {
        if (!handleSessionGone(err)) {
          console.error(err);
        }
      }
    },
    [handleSessionGone]
  );

  useEffect(() => {
    fetchChatConfig()
      .then((config) => {
        setStreamingEnabled(config.streamingEnabled);
        setTurnstileSiteKey(config.turnstileSiteKey || undefined);
      })
      .catch(() => setStreamingEnabled(false));

    // История из localStorage может быть повреждена (однажды туда попал HTML
    // из окна рестарта бэкенда и ронял весь сайт) — валидируем и самоочищаемся.
    const storedMessages = localStorage.getItem(HISTORY_KEY);
    if (storedMessages) {
      try {
        const parsed = JSON.parse(storedMessages);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        } else {
          localStorage.removeItem(HISTORY_KEY);
        }
      } catch {
        localStorage.removeItem(HISTORY_KEY);
      }
    }

    if (sessionId) {
      loadSession(sessionId);
    }
  }, [loadSession, sessionId]);

  useEffect(() => {
    if (!sessionId || isClosed) {
      return;
    }
    const interval = window.setInterval(async () => {
      try {
        const after = lastServerTimestamp(messagesRef.current);
        const incoming = await getChatMessages(sessionId, after);
        if (incoming.length > 0) {
          setMessages((prev) => {
            const next = mergeMessages(prev, incoming);
            if (next === prev) {
              return prev;
            }
            persistMessages(next);
            return next;
          });
          syncUnread(incoming);
        }
      } catch (err) {
        if (!handleSessionGone(err)) {
          console.error(err);
        }
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [handleSessionGone, isClosed, sessionId, syncUnread]);

  const ensureSession = useCallback(async () => {
    if (sessionId) {
      return sessionId;
    }

    if (turnstileSiteKey && !turnstileToken) {
      // Bot check enabled but not solved yet — surface a friendly message instead of a 403.
      throw new Error("turnstile-pending");
    }

    const payload = {
      // Single language source: the site's active locale (<html lang>), same signal the widget uses.
      email: authedEmail || undefined,
      locale: document.documentElement.lang || "en",
      turnstileToken: turnstileToken || undefined,
    };
    const response = await createChatSession(payload);
    localStorage.setItem(SESSION_KEY, response.sessionId);
    setSessionId(response.sessionId);
    await loadSession(response.sessionId);
    return response.sessionId;
  }, [authedEmail, loadSession, sessionId, turnstileSiteKey, turnstileToken]);

  const handleSend = useCallback(async (overrideText?: string | null) => {
    if (isClosed) {
      return;
    }
    const rawText = typeof overrideText === "string" ? overrideText : inputValue;
    const text = rawText.trim();
    if (!text) {
      return;
    }
    setInputValue("");
    setLastUserMessage(text);
    setError(null);
    setUnreadCount(0);
    setIsTyping(true);

    try {
      const sessionId = await ensureSession();
      const optimisticMessage: ChatMessage = {
        id: `local-${Date.now()}`,
        sessionId,
        role: "user",
        authorName: "You",
        text,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => {
        const next = [...prev, optimisticMessage];
        persistMessages(next);
        return next;
      });

      if (streamingEnabled) {
        const streamingMessageId = `stream-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: streamingMessageId,
            sessionId,
            role: "assistant",
            authorName: "Tale Support (AI)",
            text: "",
            createdAt: new Date().toISOString(),
          },
        ]);

        await streamChatMessage(
          sessionId,
          text,
          (chunk) => {
            setMessages((prev) => {
              const next = prev.map((message) =>
                message.id === streamingMessageId
                  ? { ...message, text: `${message.text}${chunk}` }
                  : message
              );
              persistMessages(next);
              return next;
            });
          },
          (payload) => {
            if (payload.message) {
              setMessages((prev) => {
                const next = prev.map((message) =>
                  message.id === streamingMessageId ? { ...payload.message } : message
                );
                persistMessages(next);
                return next;
              });
            }
            loadSession(sessionId);
            setIsTyping(false);
          },
          (streamError) => {
            setError(streamError);
            setIsTyping(false);
          }
        );
        return;
      }

      const response = await sendChatMessage(sessionId, text);
      if (response.assistantMessage) {
        setMessages((prev) => {
          const next = [...prev, response.assistantMessage!];
          persistMessages(next);
          return next;
        });
      }
      setSession(response.session);
    } catch (err) {
      if (handleSessionGone(err)) {
        return;
      }
      console.error(err);
      if (err instanceof Error && err.message === "turnstile-pending") {
        setInputValue(text); // restore the message; the bot check is still resolving
        setError(dict.verifying);
      } else {
        setError(dict.errorGeneric);
      }
    } finally {
      setIsTyping(false);
    }
  }, [
    dict.errorGeneric,
    dict.verifying,
    ensureSession,
    handleSessionGone,
    inputValue,
    isClosed,
    loadSession,
    streamingEnabled,
  ]);

  const handleQuickReply = useCallback(
    (value: string) => {
      const payload = value === dict.talkToHuman ? dict.talkToHumanMessage : value;
      setInputValue(payload);
      handleSend(payload);
    },
    [dict.talkToHuman, dict.talkToHumanMessage, handleSend]
  );

  const handleContactSubmit = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    const email = contactForm.email.trim() || undefined;
    const orderId = contactForm.orderId.trim() || undefined;
    if (!email && !orderId) {
      return;
    }
    try {
      const updated = await updateChatContact(sessionId, { email, orderId });
      setSession(updated);
      setContactForm((prev) => ({ ...prev, sent: true }));
    } catch (err) {
      if (!handleSessionGone(err)) {
        console.error(err);
      }
    }
  }, [contactForm.email, contactForm.orderId, handleSessionGone, sessionId]);

  // Оценку показываем сразу, не дожидаясь сервера: если запрос упадёт, вернём как было.
  const handleFeedback = useCallback(
    async (messageId: string, feedback: ChatFeedback | null) => {
      if (!sessionId) {
        return;
      }
      const previous = messagesRef.current.find((message) => message.id === messageId)?.metadata?.feedback;
      const apply = (value: ChatFeedback | null | undefined) =>
        setMessages((prev) => {
          const next = prev.map((message) =>
            message.id === messageId
              ? { ...message, metadata: { ...message.metadata, feedback: value ?? undefined } }
              : message
          );
          persistMessages(next);
          return next;
        });

      apply(feedback);
      try {
        await sendMessageFeedback(sessionId, messageId, feedback);
      } catch (err) {
        apply(previous);
        if (!handleSessionGone(err)) {
          console.error(err);
        }
      }
    },
    [handleSessionGone, sessionId]
  );

  const onToggle = () => {
    setIsOpen((prev) => !prev);
    setUnreadCount(0);
  };

  return (
    <div className="support-chat">
      {!isOpen && <ChatLauncherButton unreadCount={unreadCount} onClick={onToggle} />}
      <ChatWindow
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onMinimize={() => setIsOpen(false)}
        messages={messages}
        session={session}
        closed={isClosed}
        onNewChat={startNewChat}
        isTyping={isTyping}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSend={handleSend}
        onQuickReply={handleQuickReply}
        lang={lang}
        turnstileSiteKey={sessionId ? undefined : turnstileSiteKey}
        onTurnstileToken={setTurnstileToken}
        contactForm={contactForm}
        onContactChange={(field, value) => setContactForm((prev) => ({ ...prev, [field]: value }))}
        onContactSubmit={handleContactSubmit}
        error={error}
        onRetry={() => handleSend(lastUserMessage)}
        onFeedback={handleFeedback}
      />
    </div>
  );
};

export default ChatWidget;
