import { create } from 'zustand';

interface PtrStore {
  pullToRefreshIsEnabled: boolean;
  setPullToRefreshIsEnabled: (pullToRefreshIsEnabled: boolean) => void;
}

export const usePtrStore = create<PtrStore>((set) => ({
  pullToRefreshIsEnabled: true,
  setPullToRefreshIsEnabled: (pullToRefreshIsEnabled) => set({ pullToRefreshIsEnabled }),
}));
