import React, { useRef } from "react";

type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder: string;
  sendLabel: string;
};

const Composer: React.FC<ComposerProps> = ({ value, onChange, onSend, disabled, placeholder, sendLabel }) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled) {
        onSend();
      }
    }
  };

  return (
    <div className="support-chat__composer">
      <textarea
        ref={textareaRef}
        aria-label={placeholder}
        className="support-chat__input"
        placeholder={placeholder}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <button
        className="btn btn-primary"
        type="button"
        onClick={onSend}
        disabled={disabled || !value.trim()}
      >
        {sendLabel}
      </button>
    </div>
  );
};

export default Composer;
