import React, { useEffect, useRef } from "react";
import { SendIcon } from "./icons";

// Докуда полю разрешено расти, дальше — прокрутка внутри него. Совпадает с max-height в CSS.
const MAX_INPUT_HEIGHT = 120;

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

  // Поле начинается с одной строки — вровень с кнопкой — и растёт под текст, пока не упрётся
  // в потолок. Две строки «про запас» смотрелись пустой ямой рядом с кнопкой фиксированной высоты.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    // scrollHeight не включает рамку, а высота при border-box — включает: без поправки
    // поле каждый раз оказывалось на пару пикселей ниже нужного и давало лишнюю прокрутку.
    const border = textarea.offsetHeight - textarea.clientHeight;
    textarea.style.height = `${Math.min(textarea.scrollHeight + border, MAX_INPUT_HEIGHT)}px`;
  }, [value]);

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
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      {/* Подпись ушла в aria-label и подсказку: словом «Отправить» кнопка занимала треть
          строки ввода, а действие и так очевидно по самолётику. Глобальный класс .btn не
          берём — он тянет фиксированную высоту 48px, заливку и тень, а нужен голый значок. */}
      <button
        className="support-chat__send"
        type="button"
        onClick={onSend}
        disabled={disabled || !value.trim()}
        aria-label={sendLabel}
        title={sendLabel}
      >
        <SendIcon />
      </button>
    </div>
  );
};

export default Composer;
