export type ChatRole = "user" | "assistant" | "agent" | "system";

export type ChatSessionStatus = "open" | "ai" | "needsagent" | "needs_agent" | "assigned" | "closed";

export type ChatPriority = "low" | "normal" | "high";

export type ChatMessage = {
  id: string;
  sessionId: string;
  role: ChatRole;
  authorName: string;
  text: string;
  createdAt: string;
  metadata?: {
    model?: string;
    confidence?: number;
    escalationReason?: string;
    toolCall?: string;
    handoff?: boolean;
  };
};

export type ChatSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  email?: string;
  status: ChatSessionStatus;
  assignedAgentId?: string;
  assignedAgentName?: string;
  lastMessageAt?: string;
  tags: string[];
  priority: ChatPriority;
  category?: string;
  language?: string;
  summary?: string;
  escalationReason?: string;
  orderId?: string;
};

export type ChatSessionDetail = {
  session: ChatSession;
  messages: ChatMessage[];
};

export type ChatConfig = {
  streamingEnabled: boolean;
  turnstileSiteKey?: string;
};

export type ChatSessionListResponse = {
  items: Array<{
    id: string;
    status: ChatSessionStatus;
    userId?: string;
    email?: string;
    assignedAgentName?: string;
    lastMessageAt?: string;
    lastMessagePreview?: string;
    tags: string[];
    priority: ChatPriority;
  }>;
  page: number;
  pageSize: number;
  total: number;
};
