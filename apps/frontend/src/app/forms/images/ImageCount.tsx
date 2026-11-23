import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

interface ImageCountProps {
  added: number;
  max: number;
}

/** "N of M photos" under an image field: in the form, on the phone page and in the editor preview. */
export function ImageCount({ added, max }: Readonly<ImageCountProps>) {
  const { t } = useTranslations({ en, de });
  return <p className="text-xs text-default-400">{t('count', { added, count: max })}</p>;
}
