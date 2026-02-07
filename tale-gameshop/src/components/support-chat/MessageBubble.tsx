import React from "react";
import type { ChatMessage } from "../../types/support-chat";

type MessageBubbleProps = {
  message: ChatMessage;
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === "user";
  const isAgent = message.role === "agent";
  const bubbleClass = isUser
    ? "support-chat__bubble support-chat__bubble--user"
    : isAgent
      ? "support-chat__bubble support-chat__bubble--agent"
      : "support-chat__bubble support-chat__bubble--assistant";

  return (
    <div className={`support-chat__message ${isUser ? "support-chat__message--user" : ""}`}>
      {!isUser && (
        <div className="support-chat__avatar" aria-hidden="true">
          {isAgent ? "👤" : "✨"}
        </div>
      )}
      <div>
        {isUser ? (
          <div className="support-chat__author support-chat__author--user">You</div>
        ) : (
          <div className="support-chat__author">
            {isAgent ? "Tale Support (Agent)" : "Tale Support (AI)"}
          </div>
        )}
        <div className={bubbleClass}>
          <p>{message.text}</p>
        </div>
        <div className="support-chat__timestamp">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
