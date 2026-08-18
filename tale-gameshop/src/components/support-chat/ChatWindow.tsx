import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import MessageList from "./MessageList";
import Composer from "./Composer";
import QuickReplies from "./QuickReplies";
import TurnstileWidget from "./TurnstileWidget";
import type { ChatFeedback, ChatMessage, ChatSession, ViewerProfile } from "../../types/support-chat";
import { getSupportDict, type SupportLang } from "./i18n";
import { createGreeting } from "./greeting";
import { formatSessionCode } from "../../utils/support-session-code";
import { ArrowDownIcon, CloseIcon, SoundOffIcon, SoundOnIcon } from "./icons";

type ContactForm = {
  email: string;
  orderId: string;
  sent: boolean;
};

type ChatWindowProps = {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  session?: ChatSession;
  closed?: boolean;
  onNewChat: () => void;
  muted: boolean;
  onToggleMuted: () => void;
  /** Профиль вошедшего клиента для аватара его реплик; у гостя не задан. */
  viewer?: ViewerProfile;
  isTyping: boolean;
  /// Ответ на предыдущее сообщение ещё не дописан — писать следующее рано.
  busy: boolean;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onQuickReply: (value: string) => void;
  lang: SupportLang;
  turnstileSiteKey?: string;
  onTurnstileToken: (token: string) => void;
  contactForm: ContactForm;
  onContactChange: (field: "email" | "orderId", value: string) => void;
  onContactSubmit: () => void;
  error?: string | null;
  onRetry: () => void;
  onFeedback: (messageId: string, feedback: ChatFeedback | null) => void;
  onHandoff: (note: string) => void;
  waitHint: string;
  /** Есть ли что подгружать вверх; пока false — прокрутка к верху ничего не запускает. */
  hasMoreHistory: boolean;
  loadingHistory: boolean;
  onLoadOlder: () => void;
};

type WindowSize = { width: number; height: number };

/** Угол тянет обе стороны, левая грань — только ширину, верхняя — только высоту. */
type ResizeAxis = "both" | "x" | "y";

// Снизу — размер, при котором окно ещё чат, а не полоска. Сверху — прежние «развёрнутые»
// 560×760: дальше растягивать смысла нет, чат займёт половину экрана и перекроет витрину.
// Плюс общий предел по экрану, чтобы окно не уезжало за его край на маленьких мониторах.
const MIN_WINDOW = { width: 300, height: 380 };
const MAX_WINDOW = { width: 560, height: 760 };
const VIEWPORT_MARGIN = 32;
const SIZE_KEY = "tale_support_chat_size";

// На каком расстоянии от верха ленты запрашивается следующая страница переписки. С запасом
// в экран: страница должна успеть приехать до того, как человек упрётся в начало списка.
const HISTORY_TRIGGER_PX = 120;

const clamp = (value: number, min: number, max: number) => Math.round(Math.min(Math.max(value, min), max));

const clampSize = ({ width, height }: WindowSize): WindowSize => ({
  width: clamp(width, MIN_WINDOW.width, Math.min(MAX_WINDOW.width, window.innerWidth - VIEWPORT_MARGIN)),
  height: clamp(height, MIN_WINDOW.height, Math.min(MAX_WINDOW.height, window.innerHeight - VIEWPORT_MARGIN)),
});

// Размер переживает перезагрузку: менять его каждый раз заново — то же, чем была кнопка
// «развернуть». Значение из хранилища всё равно прогоняем через ограничения: окно могли
// растянуть на большом мониторе, а открыть на маленьком.
const readStoredSize = (): WindowSize | null => {
  try {
    const stored = localStorage.getItem(SIZE_KEY);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored);
    if (typeof parsed?.width !== "number" || typeof parsed?.height !== "number") {
      return null;
    }
    return clampSize(parsed);
  } catch {
    return null;
  }
};

const storeSize = (size: WindowSize) => {
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify(size));
  } catch {
    /* приватный режим — размер просто не запомнится */
  }
};

// На телефоне окно раскрывается во весь экран — иначе от него после появления
// клавиатуры остаётся полоска. Заодно отключаем перетаскивание: двигать нечего.
const useCompactViewport = () => {
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 560px)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(max-width: 560px)");
    const handler = (event: MediaQueryListEvent) => setCompact(event.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  return compact;
};

const ChatWindow: React.FC<ChatWindowProps> = ({
  isOpen,
  onClose,
  messages,
  session,
  closed,
  onNewChat,
  muted,
  onToggleMuted,
  viewer,
  isTyping,
  busy,
  inputValue,
  onInputChange,
  onSend,
  onQuickReply,
  lang,
  turnstileSiteKey,
  onTurnstileToken,
  contactForm,
  onContactChange,
  onContactSubmit,
  error,
  onRetry,
  onFeedback,
  onHandoff,
  waitHint,
  hasMoreHistory,
  loadingHistory,
  onLoadOlder,
}) => {
  const t = getSupportDict(lang);
  const compact = useCompactViewport();

  // Drag-to-move the window by its header. Position is an offset from the default anchor.
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ startX: 0, startY: 0, origX: 0, origY: 0, dragging: false });

  // Размер окна вместо кнопки «развернуть»: клиент сам решает, сколько места ему нужно.
  // Окно прижато к правому нижнему углу, поэтому ручка — в левом верхнем: тянешь наружу,
  // окно растёт, а его угол остаётся на месте.
  const windowRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<WindowSize | null>(readStoredSize);
  const resizeRef = useRef({
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    axis: "both" as ResizeAxis,
    resizing: false,
  });

  // Угол меняет обе стороны, грани — по одной. Обработчик общий: разница только в том,
  // какие координаты учитывать.
  const onResizePointerDown = (axis: ResizeAxis) => (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = windowRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      axis,
      resizing: true,
    };
  };

  const onResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    if (!resize.resizing) {
      return;
    }
    setSize(
      clampSize({
        width:
          resize.axis === "y" ? resize.startWidth : resize.startWidth + (resize.startX - event.clientX),
        height:
          resize.axis === "x" ? resize.startHeight : resize.startHeight + (resize.startY - event.clientY),
      })
    );
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current.resizing) {
      return;
    }
    resizeRef.current.resizing = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
    // Размер читаем с самого окна, а не из состояния: в замыкании обработчика оно устарело бы.
    const rect = windowRef.current?.getBoundingClientRect();
    if (rect) {
      storeSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    }
  };

  const onHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Let the minimize/close buttons work — only drag from empty header space.
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origX: pos.x,
      origY: pos.y,
      dragging: true,
    };
  };

  const onHeaderPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.dragging) {
      return;
    }
    setPos({
      x: drag.origX + (event.clientX - drag.startX),
      y: drag.origY + (event.clientY - drag.startY),
    });
  };

  const endHeaderDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.dragging) {
      dragRef.current.dragging = false;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* pointer already released */
      }
    }
  };

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
    }
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  // Кнопку эскалации показываем не сразу: сперва даём ассистенту ответить.
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffNote, setHandoffNote] = useState("");

  // Автопрокрутка только когда человек и так внизу — иначе его выбрасывало
  // из середины переписки на каждый кусочек ответа.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = (smooth = true) => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    body.scrollTo({ top: body.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  // Расстояние от низа ленты на момент запроса следующей страницы. К низу привязываемся,
  // а не к верху: дописанные сверху реплики сдвигают всё содержимое вниз ровно на свою
  // высоту, и без этой поправки человека выбрасывало бы в начало переписки.
  const historyAnchorRef = useRef<{ fromBottom: number; firstId?: string } | null>(null);

  const handleBodyScroll = () => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    setAtBottom(body.scrollHeight - body.scrollTop - body.clientHeight < 48);

    if (body.scrollTop < HISTORY_TRIGGER_PX && hasMoreHistory && !loadingHistory) {
      historyAnchorRef.current = {
        fromBottom: body.scrollHeight - body.scrollTop,
        firstId: messages[0]?.id
      };
      onLoadOlder();
    }
  };

  useEffect(() => {
    if (isOpen) {
      setAtBottom(true);
      scrollToBottom(false);
    }
  }, [isOpen]);

  // useLayoutEffect, а не useEffect: позицию возвращаем до отрисовки кадра, иначе лента
  // успевает мигнуть прыжком.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const anchor = historyAnchorRef.current;
    if (!body || !anchor) {
      return;
    }

    // Страница пришла — в начале списка теперь другая реплика. Сверяемся именно по ней:
    // пока ждём ответ, в ленту может добавиться новое сообщение снизу, и поправлять
    // прокрутку на него нельзя — человек стоит на своём месте в переписке.
    if (messages[0]?.id !== anchor.firstId) {
      body.scrollTop = body.scrollHeight - anchor.fromBottom;
      historyAnchorRef.current = null;
      return;
    }

    if (!loadingHistory) {
      // Ответ пришёл пустым: история кончилась, держать якорь больше не за чем.
      historyAnchorRef.current = null;
    }
  }, [messages, loadingHistory]);

  useEffect(() => {
    if (atBottom) {
      scrollToBottom();
    }
  }, [messages, isTyping, atBottom]);

  // Приветствие остаётся в ленте на весь разговор: раньше оно рисовалось только у пустого
  // чата и пропадало с первым же сообщением клиента — начало диалога терялось.
  // Хук объявлен до раннего выхода ниже: у закрытого окна их должно быть столько же, сколько
  // у открытого, иначе React падает на первом же открытии чата.
  const conversationStartedAt = messages[0]?.createdAt;
  const greeting = useMemo<ChatMessage>(
    () => createGreeting(t.authorAi, t.welcomeTitle, t.welcomeBody, conversationStartedAt),
    [conversationStartedAt, t.authorAi, t.welcomeBody, t.welcomeTitle]
  );

  if (!isOpen) {
    return null;
  }

  const status = session?.status;
  const isQueue = status === "needs_agent";
  const isAssigned = status === "assigned";
  const isClosed = status === "closed" || Boolean(closed);

  const statusLabel = isClosed
    ? t.statusClosed
    : isQueue
      ? t.statusQueue
      : isAssigned
        ? t.statusAssigned(session?.assignedAgentName)
        : t.statusOnline;

  const statusModifier = isClosed ? "closed" : isQueue ? "queue" : isAssigned ? "assigned" : "online";

  // «ИИ-ассистент · онлайн» под заголовком висело всегда и ничего не сообщало. Строку показываем
  // только когда состояние сменилось: подключаем специалиста, специалист на связи, диалог закрыт.
  const showStatus = statusModifier !== "online";

  // Код обращения показываем в те же моменты, что и статус, — то есть когда в разговоре
  // появляется человек. Пока отвечает ассистент, называть код некому и незачем.
  const code = formatSessionCode(session?.id);

  const hasAssistantReply = messages.some((message) => message.role === "assistant" && (message.text ?? "").trim().length > 0);
  const canAskForHuman = hasAssistantReply && !isQueue && !isAssigned && !isClosed;

  const hasContact = Boolean(session?.email || session?.orderId);
  const showContactForm = isQueue && !hasContact && !contactForm.sent;

  const labels = {
    authorAi: t.authorAi,
    authorAgent: t.authorAgent,
    helpful: t.feedbackHelpful,
    notHelpful: t.feedbackNotHelpful,
    today: t.today,
    yesterday: t.yesterday,
  };

  // На телефоне окно и так во весь экран — там ни размер, ни положение не меняем.
  const windowStyle: React.CSSProperties | undefined = compact
    ? undefined
    : {
        ...(size ? { width: size.width, height: size.height, maxHeight: size.height } : null),
        ...(pos.x || pos.y ? { transform: `translate(${pos.x}px, ${pos.y}px)` } : null),
      };

  return (
    <div
      ref={windowRef}
      className={`support-chat__window${compact ? " support-chat__window--fullscreen" : ""}`}
      role="dialog"
      aria-label={t.title}
      style={windowStyle}
    >
      {!compact &&
        (["both", "y", "x"] as const).map((axis) => (
          <div
            key={axis}
            className={`support-chat__resize support-chat__resize--${axis}`}
            role="separator"
            aria-label={t.resize}
            title={t.resize}
            onPointerDown={onResizePointerDown(axis)}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
        ))}
      <div
        className={`support-chat__header${compact ? "" : " support-chat__header--draggable"}`}
        onPointerDown={compact ? undefined : onHeaderPointerDown}
        onPointerMove={compact ? undefined : onHeaderPointerMove}
        onPointerUp={compact ? undefined : endHeaderDrag}
        onPointerCancel={compact ? undefined : endHeaderDrag}
      >
        <div>
          <div className="support-chat__title">{t.title}</div>
          {showStatus && (
            <div className={`support-chat__status support-chat__status--${statusModifier}`}>
              <span className="support-chat__status-dot" aria-hidden="true" />
              {statusLabel}
              {code && (
                <span className="support-chat__code" title={t.sessionCodeHint}>
                  {code}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="support-chat__header-actions">
          {/* Кнопки «начать заново» в шапке нет: сброс — не то, чем клиент должен управлять
              вручную. Диалог начинается сам, когда старый закончился (см. handleSessionGone
              и проверку давности в ChatWidget). Для завершённого специалистом диалога
              кнопка есть по месту — в самом уведомлении о закрытии. */}
          {/* Кнопки «развернуть» тоже нет: окно тянется за угол на любой размер,
              а фиксированные «обычный/большой» рядом с этим только мешали. */}
          {/* Кнопки «свернуть» и «закрыть» делали ровно одно и то же — прятали окно.
              Осталась одна: переписка никуда не девается, чат открывается тем же кружком. */}
          <button
            type="button"
            aria-label={muted ? t.soundOn : t.soundOff}
            title={muted ? t.soundOn : t.soundOff}
            aria-pressed={muted}
            onClick={onToggleMuted}
          >
            {muted ? <SoundOffIcon /> : <SoundOnIcon />}
          </button>
          <button type="button" aria-label={t.close} title={t.close} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="support-chat__body" ref={bodyRef} onScroll={handleBodyScroll}>
        {loadingHistory && (
          <div className="support-chat__history-loading" role="status">
            {t.loadingHistory}
          </div>
        )}
        <MessageList
          messages={[greeting, ...messages]}
          isTyping={isTyping}
          typingLabel={isAssigned ? t.typingAgent : t.typingAi}
          lang={lang}
          labels={labels}
          viewer={viewer}
          onFeedback={onFeedback}
        />

        {/* Варианты ответа под приветствием — продолжение реплики бота, а не отдельный экран.
            Прячем их сразу по нажатию (busy), не дожидаясь, пока сообщение долетит до сервера:
            пока создаётся сессия, список ещё пуст, и «печатает…» из конца ленты оказывалось
            между приветствием и подсказками. */}
        {messages.length === 0 && !busy && (
          <div className="support-chat__starters">
            <div className="support-chat__quick-replies-label">{t.quickRepliesLabel}</div>
            <QuickReplies options={t.quickReplies} onSelect={onQuickReply} />
          </div>
        )}

        {/* Проверку на робота из подсказок вынесли: она нужна как раз в момент отправки,
            а подсказки в этот момент скрываются — виджет Turnstile перезапускался бы. */}
        {messages.length === 0 && turnstileSiteKey && (
          <TurnstileWidget
            siteKey={turnstileSiteKey}
            onToken={onTurnstileToken}
            labels={{ error: t.turnstileError, retry: t.retry }}
          />
        )}

        {canAskForHuman && (
          <div className="support-chat__escape">
            {!handoffOpen ? (
              <button type="button" className="support-chat__escape-link" onClick={() => setHandoffOpen(true)}>
                {t.didNotHelp}
              </button>
            ) : (
              <div className="support-chat__escape-panel">
                <div className="support-chat__escape-title">{t.didNotHelpTitle}</div>
                <p className="support-chat__escape-hint">{waitHint}</p>
                <textarea
                  className="support-chat__escape-note"
                  rows={2}
                  value={handoffNote}
                  placeholder={t.handoffNotePlaceholder}
                  onChange={(event) => setHandoffNote(event.target.value)}
                />
                <div className="support-chat__escape-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      setHandoffOpen(false);
                      setHandoffNote("");
                    }}
                  >
                    {t.rephrase}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      onHandoff(handoffNote.trim());
                      setHandoffOpen(false);
                      setHandoffNote("");
                    }}
                  >
                    {t.handoffSubmit}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {isQueue && (
          <div className="support-chat__handoff">
            <div className="support-chat__handoff-title">🎧 {t.queueTitle}</div>
            <p>{t.queueBody}</p>
            {showContactForm && (
              <div className="support-chat__contact">
                <div className="support-chat__contact-title">{t.contactTitle}</div>
                <p>{t.contactBody}</p>
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(event) => onContactChange("email", event.target.value)}
                  placeholder={t.emailPlaceholder}
                />
                <input
                  type="text"
                  value={contactForm.orderId}
                  onChange={(event) => onContactChange("orderId", event.target.value)}
                  placeholder={t.orderPlaceholder}
                />
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={onContactSubmit}
                  disabled={!contactForm.email.trim() && !contactForm.orderId.trim()}
                >
                  {t.contactSubmit}
                </button>
              </div>
            )}
            {contactForm.sent && <div className="support-chat__contact-sent">✅ {t.contactSent}</div>}
          </div>
        )}

        {isClosed && (
          <div className="support-chat__closed">
            <p>{t.closedNotice}</p>
            <button type="button" className="btn btn-primary" onClick={onNewChat}>
              {t.newChat}
            </button>
          </div>
        )}

        {error && !isClosed && (
          <div className="support-chat__error">
            <span>{error}</span>
            <div className="support-chat__error-actions">
              <button type="button" className="btn btn-outline" onClick={onRetry}>
                {t.retry}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onQuickReply(t.talkToHuman)}
              >
                {t.talkToHuman}
              </button>
            </div>
          </div>
        )}

        {!atBottom && messages.length > 0 && (
          <button
            type="button"
            className="support-chat__scroll-down"
            aria-label={t.scrollDown}
            title={t.scrollDown}
            onClick={() => scrollToBottom()}
          >
            <ArrowDownIcon />
          </button>
        )}
      </div>

      <div className="support-chat__footer">
        <Composer
          value={inputValue}
          onChange={onInputChange}
          onSend={onSend}
          disabled={isClosed || busy}
          placeholder={
            isClosed ? t.composerPlaceholderClosed : busy ? t.composerPlaceholderBusy : t.composerPlaceholder
          }
          sendLabel={t.send}
        />
      </div>
    </div>
  );
};

export default ChatWindow;
