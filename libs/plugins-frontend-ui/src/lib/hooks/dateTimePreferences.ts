import { create } from 'zustand';
import { DateTimePreferences, resolveDateTimePreferences } from '@attraccess/shared';
import { useTranslationState } from '../i18n';

// Host and plugin consumers share the host-hydrated account preference.
export const useDateTimePreferences = create<DateTimePreferences & { userId: number | null }>(() => ({
  dateTimeLocale: null,
  userId: null,
}));

export function useDateTimeLocale(override?: string | null) {
  const { language } = useTranslationState();
  const saved = useDateTimePreferences((state) => state.dateTimeLocale);
  return resolveDateTimePreferences(override === undefined ? saved : override).dateTimeLocale ?? language;
}
