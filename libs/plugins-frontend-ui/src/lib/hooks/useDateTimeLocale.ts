import { resolveDateTimePreferences } from '@attraccess/shared';
import { useTranslationState } from '../i18n';
import { useDateTimePreferences } from './useDateTimePreferences';

export function useDateTimeLocale(override?: string | null) {
  const { language } = useTranslationState();
  const saved = useDateTimePreferences((state) => state.dateTimeLocale);
  return resolveDateTimePreferences(override === undefined ? saved : override).dateTimeLocale ?? language;
}
