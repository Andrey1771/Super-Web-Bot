import type { ChatMessage } from "../../types/support-chat";

/**
 * Приветствие бота: обычная реплика в ленте, но существует только на экране — на сервер
 * не уходит и в историю не пишется. По этому идентификатору лента узнаёт его и держит
 * первым, а пузырь понимает, что оценивать заготовку нечего.
 */
export const GREETING_ID = "local-greeting";

export const createGreeting = (
  authorName: string,
  title: string,
  body: string,
  conversationStartedAt?: string
): ChatMessage => ({
  id: GREETING_ID,
  sessionId: "",
  role: "assistant",
  authorName,
  text: `**${title}**\n\n${body}`,
  // Время берём у первой реплики диалога, а не текущее: иначе у переписки, начатой вчера,
  // приветствие попадало в «сегодня» и над ней появлялся лишний разделитель дат.
  createdAt: conversationStartedAt ?? new Date().toISOString(),
});
