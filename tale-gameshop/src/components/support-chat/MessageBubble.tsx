import React from "react";
import type { ChatFeedback, ChatMessage } from "../../types/support-chat";
import { renderMarkdown } from "./markdown";

type MessageBubbleProps = {
  message: ChatMessage;
  labels: {
    authorAi: string;
    authorAgent: string;
    you: string;
    helpful: string;
    notHelpful: string;
  };
  startsGroup: boolean;
  endsGroup: boolean;
  onFeedback?: (messageId: string, feedback: ChatFeedback | null) => void;
};

// Аватары рисуем контуром, а не эмодзи: эмодзи выглядят по-разному в каждой ОС
// и читаются как заглушка на витрине с фирменным стилем.
const AssistantAvatar = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="4" y="7" width="16" height="12" rx="4" fill="currentColor" />
    <circle cx="9.5" cy="13" r="1.4" fill="#fff" />
    <circle cx="14.5" cy="13" r="1.4" fill="#fff" />
    <path d="M12 3.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="12" cy="3" r="1.4" fill="currentColor" />
  </svg>
);

const AgentAvatar = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M5 13v-1a7 7 0 0 1 14 0v1"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      fill="none"
    />
    <rect x="3" y="12.5" width="4" height="6" rx="1.6" fill="currentColor" />
    <rect x="17" y="12.5" width="4" height="6" rx="1.6" fill="currentColor" />
    <path d="M19 18.5v.7a2.6 2.6 0 0 1-2.6 2.6H13" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
  </svg>
);

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, labels, startsGroup, endsGroup, onFeedback }) => {
  const isUser = message.role === "user";
  const isAgent = message.role === "agent";
  const isHandoff = Boolean(message.metadata?.handoff);

  // Оценить можно только сохранённый ответ бота: у заглушки стрима ещё нет серверного id,
  // а сообщение о передаче специалисту оценивать бессмысленно.
  const text = message.text ?? "";
  const messageId = message.id ?? "";
  const isPending = messageId.startsWith("local-") || messageId.startsWith("stream-");
  const canRate = Boolean(onFeedback) && !isUser && !isAgent && !isHandoff && !isPending && text.trim().length > 0;
  const feedback = message.metadata?.feedback;

  const rate = (value: ChatFeedback) => onFeedback?.(messageId, feedback === value ? null : value);

  const bubbleClass = [
    "support-chat__bubble",
    isUser
      ? "support-chat__bubble--user"
      : isAgent
        ? "support-chat__bubble--agent"
        : "support-chat__bubble--assistant",
    isHandoff ? "support-chat__bubble--handoff" : "",
    startsGroup ? "" : "support-chat__bubble--continued",
  ]
    .filter(Boolean)
    .join(" ");

  const messageClass = [
    "support-chat__message",
    isUser ? "support-chat__message--user" : "",
    startsGroup ? "" : "support-chat__message--continued",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={messageClass}>
      {!isUser && (
        // Место под аватар держим всегда — иначе продолжение группы съезжает влево.
        <div className={`support-chat__avatar${startsGroup ? "" : " support-chat__avatar--hidden"}`} aria-hidden="true">
          {isAgent ? <AgentAvatar /> : <AssistantAvatar />}
        </div>
      )}
      <div className="support-chat__message-body">
        {startsGroup &&
          (isUser ? (
            <div className="support-chat__author support-chat__author--user">{labels.you}</div>
          ) : (
            <div className="support-chat__author">{isAgent ? labels.authorAgent : labels.authorAi}</div>
          ))}
        <div className={bubbleClass}>
          {isUser ? (
            <p>{text}</p>
          ) : (
            <div
              className="support-chat__markdown"
              // Sanitized in renderMarkdown (DOMPurify + strict tag/attr whitelist).
              dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
            />
          )}
        </div>
        {(endsGroup || canRate) && (
          <div className="support-chat__meta-row">
            {endsGroup && (
              <span className="support-chat__timestamp">
                {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {canRate && (
              <span className="support-chat__rate">
                <button
                  type="button"
                  className={`support-chat__rate-button${feedback === "helpful" ? " is-active" : ""}`}
                  aria-label={labels.helpful}
                  aria-pressed={feedback === "helpful"}
                  title={labels.helpful}
                  onClick={() => rate("helpful")}
                >
                  👍
                </button>
                <button
                  type="button"
                  className={`support-chat__rate-button${feedback === "not_helpful" ? " is-active" : ""}`}
                  aria-label={labels.notHelpful}
                  aria-pressed={feedback === "not_helpful"}
                  title={labels.notHelpful}
                  onClick={() => rate("not_helpful")}
                >
                  👎
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
