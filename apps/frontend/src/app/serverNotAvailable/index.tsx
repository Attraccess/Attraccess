import { useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';

export function ServerNotAvailable() {
  const { t } = useTranslations('serverNotAvailable', {
    de,
    en,
  });

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-4xl font-bold">{t('title')}</h1>
      <p className="text-lg">{t('description')}</p>
    </div>
  );
}
