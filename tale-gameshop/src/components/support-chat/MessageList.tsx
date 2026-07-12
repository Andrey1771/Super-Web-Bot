import React, { useEffect, useRef } from "react";
import type { ChatMessage } from "../../types/support-chat";
import MessageBubble from "./MessageBubble";

type MessageListProps = {
  messages: ChatMessage[];
  isTyping: boolean;
  typingLabel: string;
  labels: { authorAi: string; authorAgent: string; you: string };
};

const MessageList: React.FC<MessageListProps> = ({ messages, isTyping, typingLabel, labels }) => {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="support-chat__messages" role="log" aria-live="polite">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} labels={labels} />
      ))}
      {isTyping && (
        <div className="support-chat__typing" aria-live="polite">
          <span className="support-chat__typing-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {typingLabel}
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
};

export default MessageList;
