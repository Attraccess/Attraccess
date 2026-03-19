import { create } from 'zustand';

interface AiChatState {
  isOpen: boolean;

  toggle: () => void;
  setOpen: (open: boolean) => void;
}

export const useAiChatStore = create<AiChatState>((set) => ({
  isOpen: false,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
}));

