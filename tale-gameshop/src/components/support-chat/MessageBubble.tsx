import React, { useState } from "react";
import type { ChatFeedback, ChatMessage, ViewerProfile } from "../../types/support-chat";
import { renderMarkdown } from "./markdown";
import { AgentAvatarIcon, BotAvatarIcon, UserAvatarIcon } from "./icons";

type MessageBubbleProps = {
  message: ChatMessage;
  labels: {
    authorAi: string;
    authorAgent: string;
    helpful: string;
    notHelpful: string;
  };
  startsGroup: boolean;
  endsGroup: boolean;
  /** Подпись автора нужна не всегда — см. MessageList, где решается, у какой реплики её рисовать. */
  showAuthor: boolean;
  /** Профиль вошедшего клиента: его реплики получают личный аватар вместо общего силуэта. */
  viewer?: ViewerProfile;
  onFeedback?: (messageId: string, feedback: ChatFeedback | null) => void;
};

// Из «Иван Петров» — «ИП», из «ivan@mail.com» — «I». Больше двух букв в кружок 28px не влезает.
const toInitials = (name: string): string =>
  name
    .split("@")[0]
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  labels,
  startsGroup,
  endsGroup,
  showAuthor,
  viewer,
  onFeedback,
}) => {
  // Картинка профиля может не открыться (ссылка протухла, провайдер закрыл доступ) —
  // тогда молча падаем на инициалы, а не показываем битый значок.
  const [photoBroken, setPhotoBroken] = useState(false);
  const isUser = message.role === "user";
  const isAgent = message.role === "agent";
  const isHandoff = Boolean(message.metadata?.handoff);

  // Оценить можно только сохранённый ответ бота: у заглушки стрима ещё нет серверного id,
  // а сообщение о передаче специалисту оценивать бессмысленно.
  const isPending = message.id.startsWith("local-") || message.id.startsWith("stream-");
  const text = message.text ?? "";
  const canRate = Boolean(onFeedback) && !isUser && !isAgent && !isHandoff && !isPending && text.trim().length > 0;
  const feedback = message.metadata?.feedback;

  const rate = (value: ChatFeedback) => onFeedback?.(message.id, feedback === value ? null : value);

  const bubbleClass = [
    "support-chat__bubble",
    isUser
      ? "support-chat__bubble--user"
      : isAgent
        ? "support-chat__bubble--agent"
        : "support-chat__bubble--assistant",
    isHandoff ? "support-chat__bubble--handoff" : "",
    startsGroup ? "" : "support-chat__bubble--continued",
  ]
    .filter(Boolean)
    .join(" ");

  const messageClass = [
    "support-chat__message",
    isUser ? "support-chat__message--user" : "",
    startsGroup ? "" : "support-chat__message--continued",
  ]
    .filter(Boolean)
    .join(" ");

  const avatarKind = isUser ? "user" : isAgent ? "agent" : "ai";

  return (
    <div className={messageClass}>
      {/* Место под аватар держим и у продолжения группы, иначе реплики в ней съезжают. */}
      <div
        className={`support-chat__avatar support-chat__avatar--${avatarKind}${
          startsGroup ? "" : " support-chat__avatar--hidden"
        }`}
        aria-hidden="true"
      >
        {!isUser ? (
          isAgent ? (
            <AgentAvatarIcon />
          ) : (
            <BotAvatarIcon />
          )
        ) : viewer?.picture && !photoBroken ? (
          <img
            className="support-chat__avatar-photo"
            src={viewer.picture}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setPhotoBroken(true)}
          />
        ) : viewer?.name ? (
          <span className="support-chat__avatar-initials">{toInitials(viewer.name)}</span>
        ) : (
          // Гость: имени нет, показываем общий силуэт.
          <UserAvatarIcon />
        )}
      </div>
      <div className="support-chat__message-body">
        {showAuthor && (
          <div className="support-chat__author">{isAgent ? labels.authorAgent : labels.authorAi}</div>
        )}
        <div className={bubbleClass}>
          {isUser ? (
            <p>{text}</p>
          ) : (
            <div
              className="support-chat__markdown"
              // Sanitized in renderMarkdown (DOMPurify + strict tag/attr whitelist).
              dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
            />
          )}
        </div>
        {(endsGroup || canRate) && (
          <div className="support-chat__meta-row">
            {endsGroup && (
              <span className="support-chat__timestamp">
                {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {canRate && (
              <span className="support-chat__rate">
                <button
                  type="button"
                  className={`support-chat__rate-button${feedback === "helpful" ? " is-active" : ""}`}
                  aria-label={labels.helpful}
                  aria-pressed={feedback === "helpful"}
                  title={labels.helpful}
                  onClick={() => rate("helpful")}
                >
                  👍
                </button>
                <button
                  type="button"
                  className={`support-chat__rate-button${feedback === "not_helpful" ? " is-active" : ""}`}
                  aria-label={labels.notHelpful}
                  aria-pressed={feedback === "not_helpful"}
                  title={labels.notHelpful}
                  onClick={() => rate("not_helpful")}
                >
                  👎
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
