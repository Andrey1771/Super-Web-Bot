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
  onFeedback?: (messageId: string, feedback: ChatFeedback | null) => void;
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, labels, onFeedback }) => {
  const isUser = message.role === "user";
  const isAgent = message.role === "agent";
  const isHandoff = Boolean(message.metadata?.handoff);

  // Оценить можно только сохранённый ответ бота: у заглушки стрима ещё нет серверного id,
  // а сообщение о передаче специалисту оценивать бессмысленно.
  const isPending = message.id.startsWith("local-") || message.id.startsWith("stream-");
  const canRate = Boolean(onFeedback) && !isUser && !isAgent && !isHandoff && !isPending && message.text.trim().length > 0;
  const feedback = message.metadata?.feedback;

  const rate = (value: ChatFeedback) => onFeedback?.(message.id, feedback === value ? null : value);

  const bubbleClass = [
    "support-chat__bubble",
    isUser
      ? "support-chat__bubble--user"
      : isAgent
        ? "support-chat__bubble--agent"
        : "support-chat__bubble--assistant",
    isHandoff ? "support-chat__bubble--handoff" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`support-chat__message ${isUser ? "support-chat__message--user" : ""}`}>
      {!isUser && (
        <div className="support-chat__avatar" aria-hidden="true">
          {isAgent ? "🧑‍💼" : "✨"}
        </div>
      )}
      <div>
        {isUser ? (
          <div className="support-chat__author support-chat__author--user">{labels.you}</div>
        ) : (
          <div className="support-chat__author">{isAgent ? labels.authorAgent : labels.authorAi}</div>
        )}
        <div className={bubbleClass}>
          {isUser ? (
            <p>{message.text}</p>
          ) : (
            <div
              className="support-chat__markdown"
              // Sanitized in renderMarkdown (DOMPurify + strict tag/attr whitelist).
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }}
            />
          )}
        </div>
        <div className="support-chat__meta-row">
          <span className="support-chat__timestamp">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
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
      </div>
    </div>
  );
};

export default MessageBubble;
