import { create } from 'zustand';

interface DeviceEnrollmentStore {
  isOpen: boolean;
  /** Code to prefill, e.g. from a `?enroll=` link or a scanned QR code. */
  code: string;
  open: (code?: string) => void;
  close: () => void;
}

export const useDeviceEnrollmentStore = create<DeviceEnrollmentStore>((set) => ({
  isOpen: false,
  code: '',
  open: (code = '') => set({ isOpen: true, code }),
  close: () => set({ isOpen: false, code: '' }),
}));
