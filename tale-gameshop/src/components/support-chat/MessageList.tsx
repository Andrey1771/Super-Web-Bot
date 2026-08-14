import React, { useMemo } from "react";
import type { ChatFeedback, ChatMessage } from "../../types/support-chat";
import MessageBubble from "./MessageBubble";
import type { SupportLang } from "./i18n";

type MessageListProps = {
  messages: ChatMessage[];
  isTyping: boolean;
  typingLabel: string;
  lang: SupportLang;
  labels: {
    authorAi: string;
    authorAgent: string;
    you: string;
    helpful: string;
    notHelpful: string;
    today: string;
    yesterday: string;
  };
  onFeedback?: (messageId: string, feedback: ChatFeedback | null) => void;
};

// Подряд идущие реплики одного автора в пределах этого промежутка считаются одной группой:
// имя и аватар рисуются один раз сверху, время — один раз снизу.
const GROUP_GAP_MS = 5 * 60 * 1000;

const startOfDay = (value: string) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

// Прокруткой владеет ChatWindow: скроллится вся область .support-chat__body,
// и решение «прокручивать или нет» зависит от того, где сейчас находится читатель.
const MessageList: React.FC<MessageListProps> = ({ messages, isTyping, typingLabel, lang, labels, onFeedback }) => {
  const rows = useMemo(() => {
    // Пустая заглушка ответа висит до первого куска стрима — рисовать её незачем,
    // роль «сейчас печатает» играет отдельный индикатор.
    const visible = messages.filter(
      (message) => message.role === "user" || (message.text ?? "").trim().length > 0
    );
    const locale = lang === "ru" ? "ru-RU" : "en-US";
    const today = startOfDay(new Date().toISOString());
    const yesterday = today - 24 * 60 * 60 * 1000;

    const dayLabel = (value: string) => {
      const day = startOfDay(value);
      if (day === today) return labels.today;
      if (day === yesterday) return labels.yesterday;
      return new Date(value).toLocaleDateString(locale, { day: "numeric", month: "long" });
    };

    const sameGroup = (a: ChatMessage, b: ChatMessage) =>
      a.role === b.role &&
      startOfDay(a.createdAt) === startOfDay(b.createdAt) &&
      Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) < GROUP_GAP_MS;

    return visible.map((message, index) => {
      const previous = visible[index - 1];
      const next = visible[index + 1];
      return {
        message,
        separator: !previous || startOfDay(previous.createdAt) !== startOfDay(message.createdAt)
          ? dayLabel(message.createdAt)
          : null,
        startsGroup: !previous || !sameGroup(previous, message),
        endsGroup: !next || !sameGroup(message, next),
      };
    });
  }, [labels.today, labels.yesterday, lang, messages]);

  return (
    <div className="support-chat__messages" role="log" aria-live="polite">
      {rows.map((row) => (
        <React.Fragment key={row.message.id}>
          {row.separator && (
            <div className="support-chat__day" role="separator">
              <span>{row.separator}</span>
            </div>
          )}
          <MessageBubble
            message={row.message}
            labels={labels}
            startsGroup={row.startsGroup}
            endsGroup={row.endsGroup}
            onFeedback={onFeedback}
          />
        </React.Fragment>
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
