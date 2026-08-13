import React from "react";
import type { ChatFeedback, ChatMessage } from "../../types/support-chat";
import MessageBubble from "./MessageBubble";

type MessageListProps = {
  messages: ChatMessage[];
  isTyping: boolean;
  typingLabel: string;
  labels: { authorAi: string; authorAgent: string; you: string; helpful: string; notHelpful: string };
  onFeedback?: (messageId: string, feedback: ChatFeedback | null) => void;
};

// Прокруткой владеет ChatWindow: скроллится вся область .support-chat__body,
// и решение «прокручивать или нет» зависит от того, где сейчас находится читатель.
const MessageList: React.FC<MessageListProps> = ({ messages, isTyping, typingLabel, labels, onFeedback }) => {
  return (
    <div className="support-chat__messages" role="log" aria-live="polite">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} labels={labels} onFeedback={onFeedback} />
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
    </div>
  );
};

export default MessageList;
