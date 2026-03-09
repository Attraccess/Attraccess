import { create } from 'zustand';

interface AiChatState {
  isOpen: boolean;
  conversationId: string | null;

  toggle: () => void;
  setOpen: (open: boolean) => void;
  setConversationId: (id: string) => void;
  clear: () => void;
}

const STORAGE_KEY = 'attraccess_ai_conversation_id';

export const useAiChatStore = create<AiChatState>((set) => ({
  isOpen: false,
  conversationId: null,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),

  setConversationId: (id) => {
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
    return set({ conversationId: id });
  },

  clear: () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return set({ conversationId: null });
  },
}));

