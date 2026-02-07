import React, { useEffect } from "react";
import MessageList from "./MessageList";
import Composer from "./Composer";
import QuickReplies from "./QuickReplies";
import type { ChatMessage, ChatSession } from "../../types/support-chat";

type ChatWindowProps = {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  messages: ChatMessage[];
  session?: ChatSession;
  isTyping: boolean;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onQuickReply: (value: string) => void;
  leadForm: {
    email: string;
    orderId: string;
    show: boolean;
  };
  onLeadChange: (field: "email" | "orderId", value: string) => void;
  onLeadSubmit: () => void;
  error?: string | null;
  onRetry: () => void;
};

const quickReplies = [
  "I have a payment issue",
  "Where is my key?",
  "Refund request",
  "Account & security",
  "Talk to a human",
];

const ChatWindow: React.FC<ChatWindowProps> = ({
  isOpen,
  onClose,
  onMinimize,
  messages,
  session,
  isTyping,
  inputValue,
  onInputChange,
  onSend,
  onQuickReply,
  leadForm,
  onLeadChange,
  onLeadSubmit,
  error,
  onRetry,
}) => {
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

  if (!isOpen) {
    return null;
  }

  return (
    <div className="support-chat__window" role="dialog" aria-label="Support chat">
      <div className="support-chat__header">
        <div>
          <div className="support-chat__title">Tale Shop Support</div>
          <div className={`support-chat__status ${session?.status === "needs_agent" ? "offline" : ""}`}>
            {session?.status === "needs_agent" ? "Offline (awaiting agent)" : "Online"}
          </div>
        </div>
        <div className="support-chat__header-actions">
          <button type="button" aria-label="Minimize chat" onClick={onMinimize}>
            —
          </button>
          <button type="button" aria-label="Close chat" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <div className="support-chat__body">
        {messages.length === 0 && (
          <div className="support-chat__welcome">
            <h4>Hi there! 👋</h4>
            <p>
              I’m your Tale Shop Support Assistant. I can help with orders, keys, refunds, and recommendations.
              Need a human? Just ask.
            </p>
            {leadForm.show && (
              <div className="support-chat__lead">
                <div>
                  <label htmlFor="lead-email">Email (optional)</label>
                  <input
                    id="lead-email"
                    type="email"
                    value={leadForm.email}
                    onChange={(event) => onLeadChange("email", event.target.value)}
                    placeholder="you@email.com"
                  />
                </div>
                <div>
                  <label htmlFor="lead-order">Order ID (optional)</label>
                  <input
                    id="lead-order"
                    type="text"
                    value={leadForm.orderId}
                    onChange={(event) => onLeadChange("orderId", event.target.value)}
                    placeholder="TKT-00000"
                  />
                </div>
                <button className="btn btn-outline" type="button" onClick={onLeadSubmit}>
                  Continue
                </button>
              </div>
            )}
            <QuickReplies options={quickReplies} onSelect={onQuickReply} />
          </div>
        )}

        {messages.length > 0 && <MessageList messages={messages} isTyping={isTyping} />}
        {error && (
          <div className="support-chat__error">
            <span>{error}</span>
            <div className="support-chat__error-actions">
              <button type="button" className="btn btn-outline" onClick={onRetry}>
                Retry
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onQuickReply("Talk to a human")}
              >
                Talk to a human
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="support-chat__footer">
        <Composer value={inputValue} onChange={onInputChange} onSend={onSend} />
        <div className="support-chat__note">
          Powered by AI. Need a human? Ask anytime.
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
