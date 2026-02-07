import React, { useEffect, useRef } from "react";
import type { ChatMessage } from "../../types/support-chat";
import MessageBubble from "./MessageBubble";

type MessageListProps = {
  messages: ChatMessage[];
  isTyping: boolean;
};

const MessageList: React.FC<MessageListProps> = ({ messages, isTyping }) => {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="support-chat__messages" role="log" aria-live="polite">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {isTyping && (
        <div className="support-chat__typing" aria-live="polite">
          AI is typing…
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
};

export default MessageList;
