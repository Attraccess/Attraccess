import { create } from 'zustand';
import type { DateTimePreferences } from '@attraccess/shared';

// Host and plugin consumers share the host-hydrated account preference.
export const useDateTimePreferences = create<DateTimePreferences & { userId: number | null }>(() => ({
  dateTimeLocale: null,
  userId: null,
}));
