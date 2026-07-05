import React from "react";

type ChatLauncherButtonProps = {
  unreadCount: number;
  onClick: () => void;
};

// Компактная круглая иконка чата: не перекрывает CTA страниц (раньше широкая
// пилюля «Support» наезжала на кнопки) и не путается с разделом Help/страницей Support.
const ChatLauncherButton: React.FC<ChatLauncherButtonProps> = ({ unreadCount, onClick }) => {
  return (
    <button
      className="support-chat__launcher"
      onClick={onClick}
      aria-label="Open support chat"
      title="Chat with support"
      type="button"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4.5 6.4A2.9 2.9 0 0 1 7.4 3.5h9.2a2.9 2.9 0 0 1 2.9 2.9v7.2a2.9 2.9 0 0 1-2.9 2.9H9.6l-3.8 3.2a.7.7 0 0 1-1.15-.53l-.15-2.8A2.9 2.9 0 0 1 4.5 13V6.4Z"
          fill="currentColor"
        />
        <circle cx="9" cy="10" r="1.2" fill="#6d3bff" />
        <circle cx="12.5" cy="10" r="1.2" fill="#6d3bff" />
        <circle cx="16" cy="10" r="1.2" fill="#6d3bff" />
      </svg>
      {unreadCount > 0 && <span className="support-chat__badge">{unreadCount}</span>}
    </button>
  );
};

export default ChatLauncherButton;
