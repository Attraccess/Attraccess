import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

/** Returns a function that copies text and toasts the outcome. */
export function useCopyToClipboard() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  return async (text: string, successTitle: string, successDescription: string) => {
    if (!navigator?.clipboard?.writeText) {
      toast.error({ title: t('copyFailed.title'), description: t('copyFailed.description') });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success({ title: successTitle, description: successDescription });
    } catch {
      toast.error({ title: t('copyFailed.title'), description: t('copyFailed.description') });
    }
  };
}
