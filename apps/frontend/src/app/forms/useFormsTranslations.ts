import { useTranslations } from '@attraccess/plugins-frontend-ui';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import de from './de.json';
import en from './en.json';

/**
 * The forms strings plus the shared API error texts under `api`, so `toast.apiError` finds a message. React escapes
 * the output; escaping names again would show `A &amp; B`.
 */
export function useFormsTranslations() {
  return useTranslations(
    {
      en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
      de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
    },
    { escapeValues: false },
  );
}
