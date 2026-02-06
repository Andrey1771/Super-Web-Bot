import React from "react";

type ChatLauncherButtonProps = {
  unreadCount: number;
  onClick: () => void;
};

const ChatLauncherButton: React.FC<ChatLauncherButtonProps> = ({ unreadCount, onClick }) => {
  return (
    <button
      className="support-chat__launcher"
      onClick={onClick}
      aria-label="Open support chat"
      type="button"
    >
      <span>Support</span>
      {unreadCount > 0 && <span className="support-chat__badge">{unreadCount}</span>}
    </button>
  );
};

export default ChatLauncherButton;
