import React, { useMemo } from "react";
import type { ChatFeedback, ChatMessage, ViewerProfile } from "../../types/support-chat";
import MessageBubble from "./MessageBubble";
import type { SupportLang } from "./i18n";
import { GREETING_ID } from "./greeting";

type MessageListProps = {
  messages: ChatMessage[];
  isTyping: boolean;
  typingLabel: string;
  lang: SupportLang;
  labels: {
    authorAi: string;
    authorAgent: string;
    helpful: string;
    notHelpful: string;
    today: string;
    yesterday: string;
  };
  viewer?: ViewerProfile;
  onFeedback?: (messageId: string, feedback: ChatFeedback | null) => void;
};

// Подряд идущие реплики одного автора в пределах этого промежутка считаются одной группой:
// имя и аватар рисуются один раз сверху, время — один раз снизу.
const GROUP_GAP_MS = 5 * 60 * 1000;

const startOfDay = (value: string) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

// Порядок в состоянии — порядок прихода, а он не совпадает с порядком переписки:
// отставший ответ дописывается в конец списка и оказывается под чужим вопросом.
// Сортируем по времени сервера; свои неподтверждённые сообщения держим внизу,
// потому что их время — по часам браузера и сравнивать его с серверным нельзя.
const isLocalId = (id: string) => id.startsWith("local-") || id.startsWith("stream-");

const byConversationOrder = (a: ChatMessage, b: ChatMessage) => {
  // Приветствие — реплика без своего времени, и общее правило «свои неподтверждённые вниз»
  // утащило бы его в конец переписки. Место у него одно: самое начало.
  if (a.id === GREETING_ID || b.id === GREETING_ID) {
    return a.id === GREETING_ID ? (b.id === GREETING_ID ? 0 : -1) : 1;
  }

  const localA = isLocalId(a.id);
  const localB = isLocalId(b.id);
  if (localA !== localB) {
    return localA ? 1 : -1;
  }
  if (localA) {
    return 0;
  }
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
};

// Прокруткой владеет ChatWindow: скроллится вся область .support-chat__body,
// и решение «прокручивать или нет» зависит от того, где сейчас находится читатель.
const MessageList: React.FC<MessageListProps> = ({ messages, isTyping, typingLabel, lang, labels, viewer, onFeedback }) => {
  const rows = useMemo(() => {
    // Пустая заглушка ответа висит до первого куска стрима — рисовать её незачем,
    // роль «сейчас печатает» играет отдельный индикатор.
    const visible = messages
      .filter((message) => message.role === "user" || (message.text ?? "").trim().length > 0)
      .sort(byConversationOrder);
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

    // Кто пишет, видно по стороне и цвету пузыря, поэтому подпись автора над каждой репликой —
    // лишний шум. Оставляем два случая, где она несёт смысл: первый ответ бота (клиент должен
    // понимать, что говорит с ИИ) и реплики живого специалиста (сменился собеседник).
    const firstAssistantId = visible.find((message) => message.role === "assistant")?.id;

    return visible.map((message, index) => {
      const previous = visible[index - 1];
      const next = visible[index + 1];
      const startsGroup = !previous || !sameGroup(previous, message);
      return {
        message,
        separator: !previous || startOfDay(previous.createdAt) !== startOfDay(message.createdAt)
          ? dayLabel(message.createdAt)
          : null,
        startsGroup,
        endsGroup: !next || !sameGroup(message, next),
        showAuthor:
          startsGroup && (message.role === "agent" || message.id === firstAssistantId),
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
            showAuthor={row.showAuthor}
            viewer={viewer}
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
