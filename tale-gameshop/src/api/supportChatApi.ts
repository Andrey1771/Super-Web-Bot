import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";
import type { IUrlService } from "../iterfaces/i-url-service";
import type {
  ChatConfig,
  ChatFeedback,
  ChatMessage,
  ChatSessionDetail,
  ChatSessionListResponse,
  SupportChatStats,
} from "../types/support-chat";

const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;
const apiBaseUrl = () => container.get<IUrlService>(IDENTIFIERS.IUrlService).apiBaseUrl;

// Защита от «не-JSON» ответов (например, HTML в окно рестарта бэкенда):
// неожиданная форма не должна попадать в состояние чата и ронять приложение.
const ensureArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const ensureObject = <T,>(value: unknown, context: string): T => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Unexpected ${context} response shape.`);
  }
  return value as T;
};

export const fetchChatConfig = async (): Promise<ChatConfig> => {
  const response = await apiClient().get("/api/support/chat/config");
  return response.data as ChatConfig;
};

export const createChatSession = async (payload: {
  email?: string;
  orderId?: string;
  locale?: string;
  turnstileToken?: string;
}): Promise<{ sessionId: string; status: string }> => {
  const response = await apiClient().post("/api/support/chat/sessions", payload);
  return response.data;
};

export const getChatSession = async (sessionId: string): Promise<ChatSessionDetail> => {
  const response = await apiClient().get(`/api/support/chat/sessions/${sessionId}`);
  const detail = ensureObject<ChatSessionDetail>(response.data, 'chat session');
  return { ...detail, messages: ensureArray<ChatMessage>(detail.messages) };
};

export const updateChatContact = async (
  sessionId: string,
  payload: { email?: string; orderId?: string }
): Promise<ChatSessionDetail["session"]> => {
  const response = await apiClient().post(`/api/support/chat/sessions/${sessionId}/contact`, payload);
  return response.data;
};

export const getChatMessages = async (
  sessionId: string,
  after?: string
): Promise<ChatMessage[]> => {
  const response = await apiClient().get(`/api/support/chat/sessions/${sessionId}/messages`, {
    params: after ? { after } : {},
  });
  return ensureArray<ChatMessage>(response.data);
};

export const sendChatMessage = async (
  sessionId: string,
  text: string
): Promise<{ session: ChatSessionDetail["session"]; assistantMessage?: ChatMessage | null }> => {
  const response = await apiClient().post(`/api/support/chat/sessions/${sessionId}/messages`, { text });
  return response.data;
};

export const streamChatMessage = async (
  sessionId: string,
  text: string,
  onChunk: (chunk: string) => void,
  onDone: (payload: { message?: ChatMessage | null }) => void,
  onError: (error: string) => void
) => {
  const response = await fetch(`${apiBaseUrl()}/api/support/chat/sessions/${sessionId}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok || !response.body) {
    onError("Unable to start streaming.");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    parts.forEach((part) => {
      if (!part.trim()) {
        return;
      }
      const lines = part.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLine = lines.find((line) => line.startsWith("data:"));
      if (!dataLine) {
        return;
      }
      const data = dataLine.replace("data:", "").trim();
      if (eventLine?.includes("done")) {
        onDone(JSON.parse(data));
        return;
      }
      if (eventLine?.includes("error")) {
        const error = JSON.parse(data)?.error ?? "Streaming error.";
        onError(error);
        return;
      }
      const payload = JSON.parse(data);
      if (payload?.text) {
        onChunk(payload.text);
      }
    });
  }
};

// Явная просьба передать специалисту: отдельный источник в статистике плюс описание и контакты,
// чтобы оператор открыл диалог с готовым делом.
export const requestHandoff = async (
  sessionId: string,
  payload: { note?: string; email?: string; orderId?: string }
): Promise<{ session: ChatSessionDetail["session"]; assistantMessage?: ChatMessage | null }> => {
  const response = await apiClient().post(`/api/support/chat/sessions/${sessionId}/handoff`, payload);
  return response.data;
};

// null снимает ранее поставленную оценку — повторное нажатие той же кнопки.
export const sendMessageFeedback = async (
  sessionId: string,
  messageId: string,
  feedback: ChatFeedback | null
): Promise<ChatMessage> => {
  const response = await apiClient().post(
    `/api/support/chat/sessions/${sessionId}/messages/${messageId}/feedback`,
    { feedback }
  );
  return response.data as ChatMessage;
};

export const getSupportChatStats = async (days: number): Promise<SupportChatStats> => {
  const response = await apiClient().get("/api/support/admin/chat/stats", { params: { days } });
  return response.data as SupportChatStats;
};

export const listChatSessions = async (params: {
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<ChatSessionListResponse> => {
  const response = await apiClient().get("/api/support/admin/chat/sessions", { params });
  return response.data;
};

export const getChatSessionAdmin = async (sessionId: string): Promise<ChatSessionDetail> => {
  const response = await apiClient().get(`/api/support/admin/chat/sessions/${sessionId}`);
  return response.data;
};

export const assignChatSession = async (sessionId: string) => {
  const response = await apiClient().post(`/api/support/admin/chat/sessions/${sessionId}/assign`);
  return response.data;
};

export const updateChatSession = async (sessionId: string, payload: { status?: string; priority?: string; tag?: string }) => {
  const response = await apiClient().patch(`/api/support/admin/chat/sessions/${sessionId}`, payload);
  return response.data;
};

export const sendAgentMessage = async (sessionId: string, text: string): Promise<ChatMessage> => {
  const response = await apiClient().post(`/api/support/admin/chat/sessions/${sessionId}/messages`, { text });
  return response.data;
};
