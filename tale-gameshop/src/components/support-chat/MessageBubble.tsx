import React from "react";
import type { ChatMessage } from "../../types/support-chat";
import { renderMarkdown } from "./markdown";

type MessageBubbleProps = {
  message: ChatMessage;
  labels: { authorAi: string; authorAgent: string; you: string };
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, labels }) => {
  const isUser = message.role === "user";
  const isAgent = message.role === "agent";
  const isHandoff = Boolean(message.metadata?.handoff);

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
        <div className="support-chat__timestamp">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
