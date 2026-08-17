import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatLauncherButton from "./ChatLauncherButton";
import ChatWindow from "./ChatWindow";
import "./support-chat.css";
import type { ChatFeedback, ChatMessage, ChatSession, ViewerProfile } from "../../types/support-chat";
import {
  createChatSession,
  fetchChatConfig,
  getChatMessages,
  getChatSession,
  sendChatMessage,
  requestHandoff,
  sendMessageFeedback,
  streamChatMessage,
  updateChatContact,
} from "../../api/supportChatApi";
import { detectSupportLang, getSupportDict } from "./i18n";
import { playIncomingChime, startTitleFlash, stopTitleFlash } from "./notify";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IKeycloakService } from "../../iterfaces/i-keycloak-service";

const SESSION_KEY = "tale_support_chat_session";
const HISTORY_KEY = "tale_support_chat_history";
// Выбор «без звука» переживает перезагрузку и новый диалог: это настройка клиента,
// а не состояние переписки, поэтому startNewChat её не трогает.
const MUTED_KEY = "tale_support_chat_muted";

// Сообщения, нарисованные до ответа сервера: у них временный id и время по часам браузера.
const isLocalId = (id: string) => id.startsWith("local-") || id.startsWith("stream-");

// Насколько курсор опроса отматывается назад от последнего известного сообщения. Ответы
// сохраняются не в том порядке, в котором создаются (генерация занимает разное время),
// поэтому строгий курсор «строго новее последнего» насовсем терял отставшие реплики.
// Повторно пришедшее сообщение отсеется по id в mergeMessages.
const POLL_OVERLAP_MS = 60 * 1000;

// Курсор опроса берём только по подтверждённым сервером сообщениям: часы браузера и сервера
// расходятся, и время оптимистичной заглушки может «перепрыгнуть» ответ специалиста.
const pollCursor = (list: ChatMessage[]): string | undefined => {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (!isLocalId(list[index].id)) {
      const seen = new Date(list[index].createdAt).getTime();
      if (Number.isNaN(seen)) {
        return undefined;
      }
      return new Date(seen - POLL_OVERLAP_MS).toISOString();
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
      !fresh.some((item) => item.role === message.role && (item.text ?? "").trim() === (message.text ?? "").trim())
  );

  return [...kept, ...fresh];
};

// После этого срока разговор считаем законченным и начинаем новый: возвращаться к переписке
// недельной давности клиент всё равно не станет, а сессия тянула бы за собой её контекст.
const STALE_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const isStale = (list: ChatMessage[]): boolean => {
  const last = list[list.length - 1];
  if (!last) {
    return false;
  }
  const at = new Date(last.createdAt).getTime();
  return !Number.isNaN(at) && Date.now() - at > STALE_SESSION_MS;
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
  const [availability, setAvailability] = useState<{
    configured: boolean;
    isOpen: boolean;
    waitMinutes: number;
    opensAt?: string;
  }>({ configured: false, isOpen: true, waitMinutes: 0 });
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const [contactForm, setContactForm] = useState({ email: "", orderId: "", sent: false });
  const [lastUserMessage, setLastUserMessage] = useState<string>("");
  // Пока ответ на предыдущее сообщение не дописан, отправку держим закрытой: параллельные
  // запросы отвечают вразнобой и каждый строит свою историю, не видя соседнего вопроса.
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const awaitingReplyRef = useRef(false);
  // Специалист закрыл диалог: переписку оставляем на экране, но писать в неё уже нельзя.
  const [isClosed, setIsClosed] = useState(false);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem(MUTED_KEY) === "1");

  const lang = useMemo(detectSupportLang, []);
  const dict = useMemo(() => getSupportDict(lang), [lang]);

  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Ответ приходит в колбэках стрима, а они держат состояние на момент отправки: если чат
  // свернули, пока бот печатал, по isOpen из замыкания он всё ещё «открыт». Отсюда ref.
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

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

  // Ref, а не состояние: колбэки стрима держат значение на момент отправки, и звук,
  // выключенный уже во время ответа, всё равно бы прозвучал.
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Единственная точка, где чат сообщает о новом ответе: счётчик на кружке, звук и мигание
  // заголовка вкладки. Сигналим, только когда ответ мог пройти мимо клиента — чат свёрнут
  // или вкладка не на виду; в открытом чате на глазах ответ и так видно.
  const alertIncoming = useCallback(
    (count: number) => {
      if (count <= 0 || (isOpenRef.current && !document.hidden)) {
        return;
      }
      setUnreadCount((prev) => prev + count);
      // Выключение касается только звука: счётчик и мигание заголовка остаются — иначе
      // «без звука» превратилось бы в «без уведомлений вообще».
      if (!isMutedRef.current) {
        playIncomingChime();
      }
      startTitleFlash(dict.titleAlert);
    },
    [dict.titleAlert]
  );

  const toggleMuted = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem(MUTED_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const syncUnread = useCallback(
    (incoming: ChatMessage[]) => {
      // Свои же сообщения, вернувшиеся с сервера, непрочитанными не считаем.
      alertIncoming(incoming.filter((message) => message.role !== "user").length);
    },
    [alertIncoming]
  );

  // Заголовок мигает, только пока ответ не увиден: чат открыли или непрочитанных не осталось —
  // возвращаем исходный. Вкладку, на которую вернулись, тоже перестаём дёргать.
  useEffect(() => {
    if (isOpen || unreadCount === 0) {
      stopTitleFlash();
    }
  }, [isOpen, unreadCount]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden) {
        stopTitleFlash();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Виджет снимают вместе со страницей — заголовок за собой чиним.
      stopTitleFlash();
    };
  }, []);

  const tokenProfile = keycloakService.keycloak?.tokenParsed as
    | { name?: string; given_name?: string; preferred_username?: string; email?: string; picture?: string }
    | undefined;

  // Signed-in users: quietly attach their account email to the session (no upfront form).
  const authedEmail = isAuthenticated ? tokenProfile?.email : undefined;

  // Гость остаётся общим силуэтом — показывать нечего. У вошедшего берём то, что есть
  // в токене: картинку профиля, иначе имя на инициалы.
  const viewer = useMemo<ViewerProfile | undefined>(
    () =>
      isAuthenticated
        ? {
            name:
              tokenProfile?.name ||
              tokenProfile?.given_name ||
              tokenProfile?.preferred_username ||
              tokenProfile?.email,
            picture: tokenProfile?.picture,
          }
        : undefined,
    [
      isAuthenticated,
      tokenProfile?.email,
      tokenProfile?.given_name,
      tokenProfile?.name,
      tokenProfile?.picture,
      tokenProfile?.preferred_username,
    ]
  );

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
  // 410 — диалог исчерпан по длине: заводим новый сами и говорим об этом одной строкой.
  // 404 — сессии нет вовсе (например, чистили базу): молча начинаем новую.
  const handleSessionGone = useCallback(
    (error: unknown): boolean => {
      const status = responseStatus(error);
      if (status === 409) {
        setIsClosed(true);
        setIsTyping(false);
        return true;
      }
      if (status === 410) {
        startNewChat();
        setError(dict.chatRestarted);
        return true;
      }
      if (status === 404) {
        startNewChat();
        return true;
      }
      return false;
    },
    [dict.chatRestarted, startNewChat]
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
        setAvailability({
          configured: Boolean(config.businessHoursConfigured),
          isOpen: config.supportIsOpen !== false,
          waitMinutes: config.expectedWaitMinutes ?? 0,
          opensAt: config.opensAt || undefined,
        });
      })
      .catch(() => setStreamingEnabled(false));

    // История из localStorage может быть повреждена (однажды туда попал HTML
    // из окна рестарта бэкенда и ронял весь сайт) — валидируем и самоочищаемся.
    const storedMessages = localStorage.getItem(HISTORY_KEY);
    if (storedMessages) {
      try {
        const parsed = JSON.parse(storedMessages);
        if (Array.isArray(parsed)) {
          // Записи неожиданной формы (из старых версий или сбойного ответа) отбрасываем:
          // одно сообщение без id или текста роняло всё приложение при восстановлении истории.
          const restored = parsed.filter(
            (message): message is ChatMessage =>
              Boolean(message) && typeof message?.id === "string" && typeof message?.text === "string"
          );

          // Идентификатор сессии лежит в localStorage бессрочно, поэтому клиент, зашедший
          // через месяц, продолжал бы позапрошлый разговор — и упирался бы в предел длины.
          // Выдохшийся диалог закрываем сами: кнопки сброса у клиента больше нет.
          if (isStale(restored)) {
            startNewChat();
            return;
          }

          setMessages(restored);
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
  }, [loadSession, sessionId, startNewChat]);

  useEffect(() => {
    if (!sessionId || isClosed) {
      return;
    }
    const interval = window.setInterval(async () => {
      try {
        const after = pollCursor(messagesRef.current);
        const incoming = await getChatMessages(sessionId, after);
        // Из-за перекрытия курсора в ответе почти всегда есть уже показанные сообщения:
        // непрочитанными считаем только те, которых на экране ещё не было.
        const known = new Set(messagesRef.current.map((message) => message.id));
        const fresh = incoming.filter((message) => !known.has(message.id));
        if (fresh.length > 0) {
          setMessages((prev) => {
            const next = mergeMessages(prev, fresh);
            if (next === prev) {
              return prev;
            }
            persistMessages(next);
            return next;
          });
          syncUnread(fresh);
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
    // Проверяем ref, а не состояние: два клика подряд попадают в один рендер,
    // и оба увидели бы isAwaitingReply === false.
    if (isClosed || awaitingReplyRef.current) {
      return;
    }
    const rawText = typeof overrideText === "string" ? overrideText : inputValue;
    const text = rawText.trim();
    if (!text) {
      return;
    }
    awaitingReplyRef.current = true;
    setIsAwaitingReply(true);
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
        // Имя как у серверной копии: иначе при подмене заглушки на ответ сервера подпись прыгает.
        authorName: viewer?.name ?? "You",
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
            // Текст пошёл — «печатает…» больше не нужно: иначе индикатор и пузырь дублируют друг друга.
            setIsTyping(false);
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
            // Через локальную переменную: внутри колбэка сужение типа по payload.message теряется.
            const finalMessage = payload.message;
            if (finalMessage) {
              setMessages((prev) => {
                const next = prev.map((message) =>
                  message.id === streamingMessageId ? finalMessage : message
                );
                persistMessages(next);
                return next;
              });
            }
            loadSession(sessionId);
            setIsTyping(false);
            alertIncoming(1);
          },
          (streamError, streamStatus) => {
            // Судьба диалога (закрыт, исчерпан, удалён) разбирается там же, где и для обычных
            // запросов: подсовываем статус в той же форме, что у ошибки axios.
            if (streamStatus && handleSessionGone({ response: { status: streamStatus } })) {
              if (streamStatus === 410) {
                setInputValue(text);
              }
            } else {
              setError(streamError);
            }
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
        alertIncoming(1);
      }
      setSession(response.session);
    } catch (err) {
      if (handleSessionGone(err)) {
        // Диалог начался заново — набранный текст возвращаем в поле, чтобы его не пришлось
        // печатать повторно: кнопка «Повторить» отправит его уже в новую сессию.
        if (responseStatus(err) === 410) {
          setInputValue(text);
        }
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
      awaitingReplyRef.current = false;
      setIsAwaitingReply(false);
      setIsTyping(false);
    }
  }, [
    alertIncoming,
    dict.errorGeneric,
    dict.verifying,
    ensureSession,
    handleSessionGone,
    inputValue,
    isClosed,
    loadSession,
    streamingEnabled,
    viewer,
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

  // Сколько ждать человека — говорим до переключения, а не после. Честный срок
  // удерживает от эскалации лучше, чем спрятанная кнопка.
  const waitHint = useMemo(() => {
    if (availability.configured && !availability.isOpen) {
      return dict.waitClosed(availability.opensAt);
    }
    return availability.waitMinutes > 0 ? dict.waitOpen(availability.waitMinutes) : dict.waitUnknown;
  }, [availability, dict]);

  const handleHandoff = useCallback(
    async (note: string) => {
      setError(null);
      try {
        const sessionId = await ensureSession();
        const response = await requestHandoff(sessionId, {
          note: note || undefined,
          email: contactForm.email.trim() || undefined,
          orderId: contactForm.orderId.trim() || undefined,
        });
        setSession(response.session);
        await loadSession(sessionId);
      } catch (err) {
        if (!handleSessionGone(err)) {
          console.error(err);
          setError(dict.errorGeneric);
        }
      }
    },
    [contactForm.email, contactForm.orderId, dict.errorGeneric, ensureSession, handleSessionGone, loadSession]
  );

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
        messages={messages}
        session={session}
        closed={isClosed}
        onNewChat={startNewChat}
        muted={isMuted}
        onToggleMuted={toggleMuted}
        viewer={viewer}
        isTyping={isTyping}
        busy={isAwaitingReply}
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
        onHandoff={handleHandoff}
        waitHint={waitHint}
      />
    </div>
  );
};

export default ChatWidget;
