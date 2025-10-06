import { useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';
import { Alert } from '@heroui/react';

export function ServerNotAvailable() {
  const { t } = useTranslations({
    de,
    en,
  });

  return (
    <div className="mb-3 sticky top-0 z-50">
      <Alert color="danger" title={t('title')} variant="faded">
        {t('description')}
      </Alert>
    </div>
  );
}
