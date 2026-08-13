import React, { useEffect, useRef, useState } from "react";
import MessageList from "./MessageList";
import Composer from "./Composer";
import QuickReplies from "./QuickReplies";
import TurnstileWidget from "./TurnstileWidget";
import type { ChatFeedback, ChatMessage, ChatSession } from "../../types/support-chat";
import { getSupportDict, type SupportLang } from "./i18n";

type ContactForm = {
  email: string;
  orderId: string;
  sent: boolean;
};

type ChatWindowProps = {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  messages: ChatMessage[];
  session?: ChatSession;
  closed?: boolean;
  onNewChat: () => void;
  isTyping: boolean;
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
  onMinimize,
  messages,
  session,
  closed,
  onNewChat,
  isTyping,
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
}) => {
  const t = getSupportDict(lang);
  const compact = useCompactViewport();
  const [expanded, setExpanded] = useState(false);

  // Drag-to-move the window by its header. Position is an offset from the default anchor.
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ startX: 0, startY: 0, origX: 0, origY: 0, dragging: false });

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

  const handleBodyScroll = () => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    setAtBottom(body.scrollHeight - body.scrollTop - body.clientHeight < 48);
  };

  useEffect(() => {
    if (isOpen) {
      setAtBottom(true);
      scrollToBottom(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (atBottom) {
      scrollToBottom();
    }
  }, [messages, isTyping, atBottom]);

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

  const hasAssistantReply = messages.some((message) => message.role === "assistant" && message.text.trim().length > 0);
  const canAskForHuman = hasAssistantReply && !isQueue && !isAssigned && !isClosed;

  const hasContact = Boolean(session?.email || session?.orderId);
  const showContactForm = isQueue && !hasContact && !contactForm.sent;

  const labels = {
    authorAi: t.authorAi,
    authorAgent: t.authorAgent,
    you: t.you,
    helpful: t.feedbackHelpful,
    notHelpful: t.feedbackNotHelpful,
    today: t.today,
    yesterday: t.yesterday,
  };

  return (
    <div
      className={[
        "support-chat__window",
        compact ? "support-chat__window--fullscreen" : "",
        !compact && expanded ? "support-chat__window--expanded" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-label={t.title}
      style={!compact && (pos.x || pos.y) ? { transform: `translate(${pos.x}px, ${pos.y}px)` } : undefined}
    >
      <div
        className={`support-chat__header${compact ? "" : " support-chat__header--draggable"}`}
        onPointerDown={compact ? undefined : onHeaderPointerDown}
        onPointerMove={compact ? undefined : onHeaderPointerMove}
        onPointerUp={compact ? undefined : endHeaderDrag}
        onPointerCancel={compact ? undefined : endHeaderDrag}
      >
        <div>
          <div className="support-chat__title">{t.title}</div>
          <div className={`support-chat__status support-chat__status--${statusModifier}`}>
            <span className="support-chat__status-dot" aria-hidden="true" />
            {statusLabel}
          </div>
        </div>
        <div className="support-chat__header-actions">
          {messages.length > 0 && (
            <button type="button" aria-label={t.newChat} title={t.newChat} onClick={onNewChat}>
              ⟳
            </button>
          )}
          {!compact && (
            <button
              type="button"
              aria-label={expanded ? t.collapse : t.expand}
              title={expanded ? t.collapse : t.expand}
              aria-pressed={expanded}
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? "⤡" : "⤢"}
            </button>
          )}
          <button type="button" aria-label={t.minimize} onClick={onMinimize}>
            —
          </button>
          <button type="button" aria-label={t.close} onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <div className="support-chat__body" ref={bodyRef} onScroll={handleBodyScroll}>
        {messages.length === 0 && (
          <div className="support-chat__welcome">
            <h4>{t.welcomeTitle}</h4>
            <p>{t.welcomeBody}</p>
            <div className="support-chat__quick-replies-label">{t.quickRepliesLabel}</div>
            <QuickReplies options={t.quickReplies} onSelect={onQuickReply} />
            {turnstileSiteKey && (
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                onToken={onTurnstileToken}
                labels={{ error: t.turnstileError, retry: t.retry }}
              />
            )}
          </div>
        )}

        {messages.length > 0 && (
          <MessageList
            messages={messages}
            isTyping={isTyping}
            typingLabel={isAssigned ? t.typingAgent : t.typingAi}
            lang={lang}
            labels={labels}
            onFeedback={onFeedback}
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
            ↓
          </button>
        )}
      </div>

      <div className="support-chat__footer">
        <Composer
          value={inputValue}
          onChange={onInputChange}
          onSend={onSend}
          disabled={isClosed}
          placeholder={isClosed ? t.composerPlaceholderClosed : t.composerPlaceholder}
          sendLabel={t.send}
        />
        <div className="support-chat__note">{t.note}</div>
      </div>
    </div>
  );
};

export default ChatWindow;
