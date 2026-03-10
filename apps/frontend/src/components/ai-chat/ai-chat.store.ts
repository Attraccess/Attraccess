import { create } from 'zustand';

interface AiChatState {
  isOpen: boolean;
  conversationId: string | null;

  toggle: () => void;
  setOpen: (open: boolean) => void;
  setConversationId: (id: string) => void;
  clear: () => void;
}

export const useAiChatStore = create<AiChatState>((set) => ({
  isOpen: false,
  conversationId: null,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  setConversationId: (id) => set({ conversationId: id }),
  clear: () => set({ conversationId: null }),
}));

