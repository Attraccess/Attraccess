import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';

/** Translations of the plugins settings section. */
export function usePluginsTranslations() {
  return useTranslations({ en, de });
}
