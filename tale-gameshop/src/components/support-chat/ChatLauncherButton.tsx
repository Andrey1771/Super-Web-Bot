import React from "react";

type ChatLauncherButtonProps = {
  unreadCount: number;
  onClick: () => void;
};

// Компактная круглая иконка чата: не перекрывает CTA страниц (раньше широкая
// пилюля «Support» наезжала на кнопки) и не путается с разделом Help/страницей Support.
const ChatLauncherButton: React.FC<ChatLauncherButtonProps> = ({ unreadCount, onClick }) => {
  const hasUnread = unreadCount > 0;

  return (
    <button
      className={`support-chat__launcher${hasUnread ? " support-chat__launcher--attention" : ""}`}
      onClick={onClick}
      aria-label={hasUnread ? `Open support chat, ${unreadCount} new` : "Open support chat"}
      title={hasUnread ? `${unreadCount} new message(s) from support` : "Chat with support"}
      type="button"
    >
      {/* Один контур вместо залитого пузыря с точками: залитая плашка 18×13 выглядела
          приплюснутой, а три точки внутри в 24 пикселях сливались в грязь. Пропорции
          ближе к квадрату — так фигура читается как реплика, а не как полоска. */}
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 7.2A3.2 3.2 0 0 1 8.2 4h7.6A3.2 3.2 0 0 1 19 7.2v5.6a3.2 3.2 0 0 1-3.2 3.2h-4.4l-3.6 3.1a.6.6 0 0 1-1-.46V16A3.2 3.2 0 0 1 5 12.8V7.2Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
      {hasUnread && (
        <span className="support-chat__badge" aria-hidden="true">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
};

export default ChatLauncherButton;
