import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';

/**
 * Translations of the plugins settings section. React escapes the output, so values (plugin names) are not
 * HTML-escaped again; otherwise a name with `'` or `&` would reach aria-labels and titles as an entity.
 */
export function usePluginsTranslations() {
  return useTranslations({ en, de }, { escapeValues: false });
}
