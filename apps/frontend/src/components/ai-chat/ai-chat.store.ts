import { create } from 'zustand';

export type MessageRole = 'user' | 'assistant';

export interface ToolCallInfo {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  result?: unknown;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCallInfo[];
  isStreaming?: boolean;
}

interface AiChatState {
  isOpen: boolean;
  conversationId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  pendingApprovals: ToolCallInfo[];

  toggle: () => void;
  setOpen: (open: boolean) => void;
  setConversationId: (id: string) => void;
  addMessage: (message: ChatMessage) => void;
  appendDelta: (content: string) => void;
  addToolCall: (toolCall: ToolCallInfo) => void;
  updateToolCallStatus: (id: string, status: ToolCallInfo['status'], result?: unknown) => void;
  setStreaming: (streaming: boolean) => void;
  finalizeAssistantMessage: () => void;
  clear: () => void;
}

export const useAiChatStore = create<AiChatState>((set) => ({
  isOpen: false,
  conversationId: null,
  messages: [],
  isStreaming: false,
  pendingApprovals: [],

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),

  setConversationId: (id) => set({ conversationId: id }),

  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),

  appendDelta: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant' && last.isStreaming) {
        msgs[msgs.length - 1] = { ...last, content: last.content + content };
      } else {
        msgs.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content,
          isStreaming: true,
        });
      }
      return { messages: msgs, isStreaming: true };
    }),

  addToolCall: (toolCall) =>
    set((s) => ({
      pendingApprovals: [...s.pendingApprovals, toolCall],
    })),

  updateToolCallStatus: (id, status, result) =>
    set((s) => ({
      pendingApprovals: s.pendingApprovals.map((tc) =>
        tc.id === id ? { ...tc, status, result } : tc,
      ),
    })),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  finalizeAssistantMessage: () =>
    set((s) => {
      const msgs = s.messages.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false } : m,
      );
      return { messages: msgs, isStreaming: false };
    }),

  clear: () =>
    set({
      conversationId: null,
      messages: [],
      isStreaming: false,
      pendingApprovals: [],
    }),
}));
