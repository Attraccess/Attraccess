import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export const useRabbitmqTranslations = () => useTranslations({ en, de }, { escapeValues: false });
