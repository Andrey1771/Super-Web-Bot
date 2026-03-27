import React, { useRef } from "react";

type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
};

const Composer: React.FC<ComposerProps> = ({ value, onChange, onSend, disabled }) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <div className="support-chat__composer">
      <textarea
        ref={textareaRef}
        aria-label="Type your message"
        className="support-chat__input"
        placeholder="Type your message..."
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <button className="btn btn-primary" type="button" onClick={onSend} disabled={disabled || !value.trim()}>
        Send
      </button>
    </div>
  );
};

export default Composer;
