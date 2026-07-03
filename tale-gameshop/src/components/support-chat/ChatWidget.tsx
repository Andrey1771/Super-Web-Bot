import React, { useCallback, useEffect, useState } from "react";
import ChatLauncherButton from "./ChatLauncherButton";
import ChatWindow from "./ChatWindow";
import "./support-chat.css";
import type { ChatMessage, ChatSession } from "../../types/support-chat";
import {
  createChatSession,
  fetchChatConfig,
  getChatMessages,
  getChatSession,
  sendChatMessage,
  streamChatMessage,
} from "../../api/supportChatApi";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IKeycloakService } from "../../iterfaces/i-keycloak-service";

const SESSION_KEY = "tale_support_chat_session";
const HISTORY_KEY = "tale_support_chat_history";
const LEAD_KEY = "tale_support_chat_lead";

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
  const [leadForm, setLeadForm] = useState({ email: "", orderId: "", show: false });
  const [lastUserMessage, setLastUserMessage] = useState<string>("");

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
      if (!isOpen && incoming.length > 0) {
        setUnreadCount((prev) => prev + incoming.length);
      }
    },
    [isOpen]
  );

  const initializeLeadCapture = useCallback(() => {
    if (isAuthenticated) {
      const token = keycloakService.keycloak?.tokenParsed as { email?: string } | undefined;
      setLeadForm((prev) => ({
        ...prev,
        email: token?.email ?? prev.email,
        show: false,
      }));
      return;
    }
    const leadCaptured = localStorage.getItem(LEAD_KEY);
    if (!leadCaptured) {
      setLeadForm((prev) => ({ ...prev, show: true }));
    }
  }, [isAuthenticated, keycloakService.keycloak]);

  const loadSession = useCallback(
    async (sessionId: string) => {
      try {
        const data = await getChatSession(sessionId);
        setSession(data.session);
        setMessages(data.messages);
        persistMessages(data.messages);
      } catch (err) {
        console.error(err);
      }
    },
    []
  );

  useEffect(() => {
    fetchChatConfig()
      .then((config) => setStreamingEnabled(config.streamingEnabled))
      .catch(() => setStreamingEnabled(false));
    initializeLeadCapture();

    const storedMessages = localStorage.getItem(HISTORY_KEY);
    if (storedMessages) {
      setMessages(JSON.parse(storedMessages));
    }

    if (sessionId) {
      loadSession(sessionId);
    }
  }, [initializeLeadCapture, loadSession, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    const interval = window.setInterval(async () => {
      try {
        const after = messages[messages.length - 1]?.createdAt;
        const incoming = await getChatMessages(sessionId, after);
        if (incoming.length > 0) {
          setMessages((prev) => {
            const next = [...prev, ...incoming];
            persistMessages(next);
            return next;
          });
          syncUnread(incoming);
        }
      } catch (err) {
        console.error(err);
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [messages, sessionId, syncUnread]);

  const ensureSession = useCallback(async () => {
    if (sessionId) {
      return sessionId;
    }

    const payload = {
      email: leadForm.email || undefined,
      orderId: leadForm.orderId || undefined,
      locale: navigator.language,
    };
    const response = await createChatSession(payload);
    localStorage.setItem(SESSION_KEY, response.sessionId);
    setSessionId(response.sessionId);
    await loadSession(response.sessionId);
    return response.sessionId;
  }, [leadForm.email, leadForm.orderId, loadSession, sessionId]);

  const handleSend = useCallback(async (overrideText?: string | null) => {
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
      console.error(err);
      setError("Something went wrong. Retry or talk to a human.");
    } finally {
      setIsTyping(false);
    }
  }, [ensureSession, inputValue, loadSession, streamingEnabled]);

  const handleQuickReply = useCallback(
    (value: string) => {
      const payload =
        value === "Talk to a human" ? "I'd like to talk to a human support agent." : value;
      setInputValue(payload);
      handleSend(payload);
    },
    [handleSend]
  );

  const handleLeadSubmit = useCallback(() => {
    setLeadForm((prev) => ({ ...prev, show: false }));
    localStorage.setItem(LEAD_KEY, "1");
  }, []);

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
        isTyping={isTyping}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSend={handleSend}
        onQuickReply={handleQuickReply}
        leadForm={leadForm}
        onLeadChange={(field, value) => setLeadForm((prev) => ({ ...prev, [field]: value }))}
        onLeadSubmit={handleLeadSubmit}
        error={error}
        onRetry={() => handleSend(lastUserMessage)}
      />
    </div>
  );
};

export default ChatWidget;
